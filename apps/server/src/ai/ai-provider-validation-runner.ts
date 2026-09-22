import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { AiCostFacts, AiUsageFacts } from '@thesis-ledger/schemas';
import { AiSdkGenerationError, type AiSdkGenerationAdapter } from './ai-sdk-generation.adapter.js';
import {
  sanitizeAiProviderError,
  type AiProviderInput,
  type AiProviderExecutionRouteInput,
} from './ai-provider.contracts.js';
import { runProviderConnectionTest, probeMessages } from './provider-connection-test.js';
import {
  adapterSupportsGenerationMode,
  type AiCompatibilityExtensionProfile,
} from './ai-provider-upstream.js';
import { runtimeAdapterForSelection } from './ai-provider-upstream.js';
import type { ProviderHealthService } from '../providers/provider-health.service.js';
import {
  explicitlyUnsupportedFormat,
  validationModes,
  type VerifiedRoute,
} from './ai-provider-validation-policy.js';

export const validationPricing = (input: AiProviderInput, model: string) => {
  const rates = input.modelPricing === undefined ? input : (input.modelPricing[model] ?? {});
  if (
    rates.costPer1kInput === undefined ||
    rates.costPer1kOutput === undefined ||
    !rates.costCurrency ||
    !/^[A-Z]{3}$/u.test(rates.costCurrency)
  )
    throw new BadRequestException(`模型 ${model} 的测试费用未知，请填写输入、输出单价和三位币种`);
  return {
    input: rates.costPer1kInput,
    output: rates.costPer1kOutput,
    currency: rates.costCurrency,
  };
};
export const validationInputEstimate = (route: AiProviderExecutionRouteInput) =>
  Buffer.byteLength(JSON.stringify(probeMessages(route.contract.id)), 'utf8') * 2 + 512;

export type ValidationRunContext = {
  input: AiProviderInput;
  credential: string;
  operationId: string;
  profile?: AiCompatibilityExtensionProfile;
  signal: AbortSignal;
  deadline: number;
  remainingCalls: number;
  allowText: boolean;
};

const unknownUsage: AiUsageFacts = { status: 'unknown', inputTokens: null, outputTokens: null };
const costFacts = (
  input: AiProviderInput,
  model: string,
  usage: AiUsageFacts,
  reported: string | null = null,
  currency: string | null = null,
): AiCostFacts => {
  if (reported !== null && currency)
    return {
      status: 'known',
      amount: reported,
      currency,
      source: 'provider_reported',
      pricingVersion: null,
    };
  const price = validationPricing(input, model);
  if (
    (usage.inputTokens !== null && usage.outputTokens !== null) ||
    (price.input === 0 && price.output === 0)
  )
    return {
      status: 'estimated',
      amount: String(
        ((usage.inputTokens ?? 0) * price.input + (usage.outputTokens ?? 0) * price.output) / 1000,
      ),
      currency: price.currency,
      source: 'configured_model_pricing',
      pricingVersion: null,
    };
  return {
    status: 'unknown',
    amount: null,
    currency: price.currency,
    source: 'provider_usage_incomplete',
    pricingVersion: null,
  };
};

export const validateProviderRoute = async (
  context: ValidationRunContext,
  route: AiProviderExecutionRouteInput,
  fingerprint: string,
  sdk: AiSdkGenerationAdapter,
  health: ProviderHealthService,
): Promise<{ record: VerifiedRoute; costUnknown: boolean }> => {
  const { input } = context;
  const adapter = runtimeAdapterForSelection({
    upstreamFormat: input.upstreamFormat,
    ...(input.chatImplementation === undefined
      ? {}
      : { chatImplementation: input.chatImplementation }),
  });
  for (const mode of validationModes(route, adapter, context.allowText)) {
    if (!adapterSupportsGenerationMode(adapter, mode))
      throw new BadRequestException('当前接口不支持所选生成方式，请修改手动设置');
    if (context.signal.aborted || Date.now() >= context.deadline)
      throw new BadRequestException('验证已取消或超过总期限，未保存配置');
    if (context.remainingCalls <= 0) throw new BadRequestException('已达到授权测试次数上限');
    context.remainingCalls -= 1;
    const requestId = randomUUID();
    const startedAt = Date.now();
    const details = {
      kind: 'ai_provider_validation',
      operationId: context.operationId,
      requestId,
      model: route.model,
      purpose: route.contract.id,
      mode,
      fingerprint,
    };
    // Write intent before any external request; interruption is not a zero-cost result.
    await health.recordHistory(input.name, 'degraded', 0, 'pending', new Date(), 'manual', {
      ...details,
      status: 'pending',
      usage: unknownUsage,
    });
    let observedUsage = unknownUsage;
    let observedCost: AiCostFacts | undefined;
    try {
      const { result, latencyMs } = await runProviderConnectionTest({
        sdk,
        adapter,
        providerId: input.name,
        baseURL: input.baseUrl,
        authMode: input.authMode,
        apiKey: context.credential,
        model: route.model,
        mode,
        purpose: route.contract.id,
        requestId,
        signal: context.signal,
        timeoutMs: Math.min(input.timeoutMs ?? 120000, context.deadline - Date.now()),
        firstOutputTimeoutMs: route.firstOutputTimeoutMs ?? input.firstOutputTimeoutMs ?? 30000,
        outputIdleTimeoutMs: route.outputIdleTimeoutMs ?? input.outputIdleTimeoutMs ?? 30000,
        ...(context.profile === undefined
          ? {}
          : { compatibilityExtensionProfile: context.profile }),
      });
      const usage = result.usage ?? unknownUsage;
      const cost = costFacts(
        input,
        route.model,
        usage,
        result.providerCost,
        result.providerCostCurrency,
      );
      observedUsage = usage;
      observedCost = cost;
      if (context.signal.aborted) throw new DOMException('验证已取消', 'AbortError');
      const checkedAt = new Date().toISOString();
      await health.recordHistory(
        input.name,
        'healthy',
        latencyMs,
        undefined,
        new Date(checkedAt),
        'manual',
        { ...details, status: 'passed', usage, cost },
      );
      return {
        record: {
          fingerprint,
          model: route.model,
          purpose: route.contract.id,
          mode,
          requestId,
          checkedAt,
          latencyMs,
        },
        costUnknown: cost.status === 'unknown',
      };
    } catch (error) {
      const usage = error instanceof AiSdkGenerationError ? error.usage : observedUsage;
      const unsupported = explicitlyUnsupportedFormat(error);
      await health.recordHistory(
        input.name,
        'degraded',
        Date.now() - startedAt,
        unsupported ? 'format_unsupported' : 'validation_failed',
        new Date(),
        'manual',
        {
          ...details,
          status: 'failed',
          usage,
          cost: observedCost ?? costFacts(input, route.model, usage),
        },
      );
      if (route.outputPolicy === 'auto' && unsupported && !context.signal.aborted) continue;
      throw new BadRequestException(
        `${route.model} / ${route.contract.id} 验证未通过：${sanitizeAiProviderError(error, context.credential)}。原配置未修改。`,
      );
    }
  }
  throw new BadRequestException(
    `${route.model} / ${route.contract.id} 的接口格式能力不可用。需要兼容方式时，请明确允许后再测试，或手动选择通过提示词生成。`,
  );
};
