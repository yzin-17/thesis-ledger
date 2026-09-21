import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  aiExecutionSummarySchema,
  aiGenerationContracts,
  type AiCostFacts,
  type AiExecutionSummary,
  type AiResearchGeneration,
  type AiResearchPolicyV1,
  type AiUsageFacts,
} from '@thesis-ledger/schemas';
import { AiExecutionStateStore, type AiExecutionOwnership } from './ai-execution-state.store.js';
import {
  AiSdkGenerationAdapter,
  AiSdkGenerationError,
  type AiSdkGenerationResult,
} from './ai-sdk-generation.adapter.js';
import { researchRoutePaidAuthorized } from './ai-research-policy.js';
import { AiProviderRegistry } from './provider-registry.js';

type ResearchRun = {
  provider: string;
  model: string;
  modelMetadata: unknown;
};

type FrozenRoute = {
  provider: string;
  model: string;
  configurationFingerprint: string;
};

type ResearchExecutionInput = {
  ownership: AiExecutionOwnership;
  run: ResearchRun;
  messages: unknown[];
  startedAt: number;
  signal: AbortSignal;
  buildResult: (output: AiResearchGeneration, provider: string) => unknown;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const frozenRoutes = (metadata: unknown): FrozenRoute[] => {
  const value = asRecord(metadata)?.researchRoutes;
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const route = asRecord(candidate);
    return typeof route?.provider === 'string' &&
      typeof route.model === 'string' &&
      typeof route.configurationFingerprint === 'string'
      ? [
          {
            provider: route.provider,
            model: route.model,
            configurationFingerprint: route.configurationFingerprint,
          },
        ]
      : [];
  });
};

const executionFrom = (metadata: unknown) => {
  const parsed = aiExecutionSummarySchema.safeParse(asRecord(metadata)?.sdkExecution);
  if (!parsed.success || !parsed.data.frozenPolicy || !parsed.data.deadlineAt)
    throw new Error('研究任务缺少冻结执行策略');
  return parsed.data;
};

const unknownCost = (source: string | null = null): AiCostFacts => ({
  status: 'unknown',
  amount: null,
  currency: null,
  source,
  pricingVersion: null,
});

const decimal = (value: number) => value.toFixed(8).replace(/\.?0+$/u, '') || '0';

const estimatedTokens = (messages: unknown[]) =>
  Math.max(1, Math.ceil(Buffer.byteLength(JSON.stringify(messages), 'utf8') / 4));

const requestTotals = (execution: AiExecutionSummary) =>
  execution.requests.reduce(
    (total, request) => {
      const revision = request.usageRevisions.at(-1);
      return {
        calls: total.calls + request.reservation.aiCalls,
        input: total.input + (revision?.usage.inputTokens ?? request.reservation.inputTokens),
        output: total.output + (revision?.usage.outputTokens ?? request.reservation.outputTokens),
        cost: total.cost + Number(revision?.cost.amount ?? request.reservation.cost.amount ?? 0),
      };
    },
    { calls: 0, input: 0, output: 0, cost: 0 },
  );

const routeCost = (
  policy: AiResearchPolicyV1,
  provider: {
    metadata?: {
      costPer1kInput?: number;
      costPer1kOutput?: number;
      costCurrency?: string;
      pricingVersion?: string;
    };
  },
  freeEvidenceRef: string | null,
  inputTokens: number,
  outputTokens: number,
): AiCostFacts | null => {
  if (freeEvidenceRef) return unknownCost(`free_evidence:${freeEvidenceRef}`.slice(0, 120));
  const metadata = provider.metadata;
  if (
    metadata?.costPer1kInput === undefined ||
    metadata.costPer1kOutput === undefined ||
    !metadata.costCurrency ||
    metadata.costCurrency !== policy.costCurrency
  )
    return null;
  return {
    status: 'estimated',
    amount: decimal(
      (inputTokens * metadata.costPer1kInput + outputTokens * metadata.costPer1kOutput) / 1_000,
    ),
    currency: metadata.costCurrency,
    source: 'frozen_provider_pricing',
    pricingVersion: metadata.pricingVersion ?? 'unversioned',
  };
};

const completedCost = (
  policy: AiResearchPolicyV1,
  provider: {
    metadata?: {
      costPer1kInput?: number;
      costPer1kOutput?: number;
      costCurrency?: string;
      pricingVersion?: string;
    };
  },
  freeEvidenceRef: string | null,
  result: Pick<AiSdkGenerationResult<unknown>, 'providerCost' | 'providerCostCurrency' | 'usage'>,
): AiCostFacts => {
  if (freeEvidenceRef) return unknownCost(`free_evidence:${freeEvidenceRef}`.slice(0, 120));
  if (result.providerCost !== null && result.providerCostCurrency === policy.costCurrency)
    return {
      status: 'known',
      amount: result.providerCost,
      currency: result.providerCostCurrency,
      source: 'provider_reported',
      pricingVersion: provider.metadata?.pricingVersion ?? null,
    };
  if (result.usage.inputTokens !== null && result.usage.outputTokens !== null) {
    const estimate = routeCost(
      policy,
      provider,
      null,
      result.usage.inputTokens,
      result.usage.outputTokens,
    );
    if (estimate) return estimate;
  }
  return unknownCost('provider_cost_unavailable');
};

const revision = (usage: AiUsageFacts, cost: AiCostFacts, now = new Date()) => ({
  revision: 1,
  usage,
  cost,
  recordedAt: now.toISOString(),
});

const waitFor = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (milliseconds <= 0) return resolve();
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('研究任务已取消', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });

const blockAfter = (
  execution: AiExecutionSummary,
  policy: AiResearchPolicyV1,
  routeIsFree: boolean,
  usage: AiUsageFacts,
  cost: AiCostFacts,
  reservation: { inputTokens: number; outputTokens: number; cost: AiCostFacts },
): AiExecutionSummary['continuationBlockedReason'] => {
  const totals = requestTotals(execution);
  const input = totals.input + (usage.inputTokens ?? reservation.inputTokens);
  const output = totals.output + (usage.outputTokens ?? reservation.outputTokens);
  const amount = totals.cost + Number(cost.amount ?? reservation.cost.amount ?? 0);
  if (
    input > policy.maxInputTokens ||
    output > policy.maxOutputTokens ||
    amount > Number(policy.maxCost)
  )
    return 'budget_exceeded';
  if (!routeIsFree && cost.status === 'unknown') return 'cost_unknown';
  return execution.continuationBlockedReason;
};

@Injectable()
export class AiResearchSdkExecution {
  constructor(
    private readonly providers: AiProviderRegistry,
    private readonly adapter: AiSdkGenerationAdapter,
    private readonly executions: AiExecutionStateStore,
  ) {}

  async execute(input: ResearchExecutionInput) {
    let execution = executionFrom(input.run.modelMetadata);
    const policy = execution.frozenPolicy!;
    const deadline = new Date(execution.deadlineAt!).getTime();
    if (Date.now() >= deadline) {
      await this.executions.failOwned(input.ownership, {
        errorCode: 'research_deadline_expired',
        errorSummary: '研究任务已超过创建时冻结的绝对期限，未发送 Provider 请求',
        durationMs: Date.now() - input.startedAt,
        continuationBlockedReason: 'expired',
      });
      return;
    }
    const model = input.run.model === 'pending' ? this.providers.defaultModel() : input.run.model;
    if (!model) throw new Error('没有配置可用的 AI Provider/Model');
    const frozen = frozenRoutes(input.run.modelMetadata);
    const attemptedProviders = new Set(
      execution.requests
        .map((request) => request.reservation.provider)
        .filter((provider): provider is string => typeof provider === 'string'),
    );
    const routes = this.providers
      .readyContractCandidates({
        model,
        contract: aiGenerationContracts.research.ref,
        ...(input.run.provider === 'pending' ? {} : { preferred: input.run.provider }),
        budgetAuthorized: (providerId, candidateModel) =>
          researchRoutePaidAuthorized(policy, providerId, candidateModel),
      })
      .filter(({ provider, execution: route }) => {
        if (attemptedProviders.has(provider.id)) return false;
        if (!provider.sdkRuntime?.()) return false;
        if (frozen.length === 0) return true;
        return frozen.some(
          (candidate) =>
            candidate.provider === provider.id &&
            candidate.model === model &&
            candidate.configurationFingerprint === route.readiness.configurationFingerprint,
        );
      })
      .slice(0, policy.maxAiCalls);
    if (routes.length === 0) throw new Error(`模型 ${model} 没有符合冻结策略的研究路由`);

    const previous = execution.requests.at(-1);
    let fallbackDelayMs = 0;
    if (previous?.error?.retryAfterMs && previous.completedAt) {
      fallbackDelayMs = Math.max(
        0,
        new Date(previous.completedAt).getTime() + previous.error.retryAfterMs - Date.now(),
      );
    }
    for (const [index, route] of routes.entries()) {
      if (fallbackDelayMs > 0) {
        if (Date.now() + fallbackDelayMs >= deadline)
          throw new Error('Retry-After 超过研究任务剩余期限');
        await waitFor(fallbackDelayMs, input.signal);
      }
      if (input.signal.aborted) throw new DOMException('研究任务已取消', 'AbortError');
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new Error('研究任务已超过创建时冻结的绝对期限');
      const totals = requestTotals(execution);
      const inputTokens = estimatedTokens(input.messages);
      const remainingCalls = policy.maxAiCalls - totals.calls;
      const outputTokens = Math.floor((policy.maxOutputTokens - totals.output) / remainingCalls);
      if (
        remainingCalls <= 0 ||
        totals.input + inputTokens > policy.maxInputTokens ||
        outputTokens <= 0
      )
        throw new Error('研究任务累计 Token 或请求次数预算不足');
      const reservationCost = routeCost(
        policy,
        route.provider,
        route.execution.freeEvidenceRef,
        inputTokens,
        outputTokens,
      );
      if (!reservationCost) continue;
      if (
        reservationCost.amount !== null &&
        totals.cost + Number(reservationCost.amount) > Number(policy.maxCost)
      )
        continue;

      const requestId = randomUUID();
      const prepared = await this.executions.prepareRequest({
        ...input.ownership,
        requestId,
        reservation: {
          aiCalls: 1,
          inputTokens,
          outputTokens,
          cost: reservationCost,
          provider: route.provider.id,
          model,
          configurationFingerprint: route.execution.readiness.configurationFingerprint,
        },
      });
      if (!prepared) return;
      const authorized = await this.executions.authorizeDispatch(input.ownership, requestId);
      if (!authorized) return;
      const runtime = route.provider.sdkRuntime?.();
      if (!runtime) return;

      try {
        const generated = await this.adapter.generate({
          requestId,
          adapter: route.execution.adapter,
          ...(route.execution.compatibilityExtensionProfile === undefined
            ? {}
            : {
                compatibilityExtensionProfile: route.execution.compatibilityExtensionProfile,
              }),
          providerId: route.provider.id,
          baseURL: runtime.baseURL,
          apiKey: runtime.apiKey,
          model,
          messages: input.messages,
          contract: aiGenerationContracts.research.ref,
          schema: aiGenerationContracts.research.schema,
          mode: route.execution.mode,
          transport: 'stream',
          maxOutputTokens: outputTokens,
          allowedUpstreams: route.execution.allowedUpstreams,
          timeout: {
            totalMs: Math.min(runtime.timeoutMs, remainingMs),
            ...(route.execution.firstOutputTimeoutMs === undefined
              ? {}
              : { firstChunkMs: route.execution.firstOutputTimeoutMs }),
            ...(route.execution.outputIdleTimeoutMs === undefined
              ? {}
              : { chunkMs: route.execution.outputIdleTimeoutMs }),
          },
          signal: input.signal,
        });
        let result: unknown;
        try {
          result = input.buildResult(generated.output, route.provider.id);
        } catch (error) {
          throw new AiSdkGenerationError(
            {
              code: 'business_invalid',
              phase: 'validation',
              summary:
                error instanceof Error ? error.message.slice(0, 500) : '研究结果业务校验失败',
              externalResult: 'complete',
              requestId,
            },
            generated.usage,
            { cause: error },
          );
        }
        const cost = completedCost(
          policy,
          route.provider,
          route.execution.freeEvidenceRef,
          generated,
        );
        const blocked = blockAfter(
          execution,
          policy,
          route.execution.freeEvidenceRef !== null,
          generated.usage,
          cost,
          { inputTokens, outputTokens, cost: reservationCost },
        );
        const settled = await this.executions.completeAndSettle({
          ...input.ownership,
          requestId,
          revision: revision(generated.usage, cost),
          outcome: {
            status: 'complete',
            finishReason: generated.rawFinishReason ?? generated.finishReason,
            contract: aiGenerationContracts.research.ref,
            schemaAccepted: true,
          },
          result,
          continuationBlockedReason: blocked,
          finalization: {
            provider: route.provider.id,
            model,
            durationMs: Date.now() - input.startedAt,
          },
        });
        if (!settled) return;
        return;
      } catch (error) {
        const sdkError =
          error instanceof AiSdkGenerationError
            ? error
            : new AiSdkGenerationError(
                {
                  code: 'persistence_failed',
                  phase: 'persistence',
                  summary:
                    error instanceof Error ? error.message.slice(0, 500) : '研究结果保存失败',
                  externalResult: 'unknown',
                  requestId,
                },
                { status: 'unknown', inputTokens: null, outputTokens: null },
                { cause: error },
              );
        const cost = completedCost(policy, route.provider, route.execution.freeEvidenceRef, {
          providerCost: null,
          providerCostCurrency: null,
          usage: sdkError.usage,
        });
        if (sdkError.fact.externalResult === 'unknown') {
          let continuationBlockedReason: 'expired' | 'cancelled' | undefined;
          if (Date.now() >= deadline) continuationBlockedReason = 'expired';
          else if (sdkError.fact.code === 'cancelled') continuationBlockedReason = 'cancelled';
          await this.executions.markUnknown(
            input.ownership,
            requestId,
            sdkError.fact,
            new Date(),
            revision(sdkError.usage, cost),
          );
          await this.executions.failOwned(input.ownership, {
            errorCode: 'research_unknown_outcome',
            errorSummary: sdkError.fact.summary,
            durationMs: Date.now() - input.startedAt,
            ...(continuationBlockedReason ? { continuationBlockedReason } : {}),
          });
          return;
        }
        const settled = await this.executions.completeAndSettle({
          ...input.ownership,
          requestId,
          revision: revision(sdkError.usage, cost),
          outcome: {
            status: 'incomplete',
            finishReason: sdkError.fact.code,
            contract: aiGenerationContracts.research.ref,
            schemaAccepted: false,
          },
          error: sdkError.fact,
        });
        if (!settled) return;
        const canFallback =
          index === 0 &&
          sdkError.fact.code === 'provider_rejected' &&
          sdkError.fact.externalResult === 'rejected_before_generation' &&
          routes.length > 1;
        if (canFallback) {
          execution = settled.execution;
          fallbackDelayMs = sdkError.fact.retryAfterMs ?? 0;
          continue;
        }
        await this.executions.failOwned(input.ownership, {
          errorCode: `research_${sdkError.fact.code}`,
          errorSummary: sdkError.fact.summary,
          durationMs: Date.now() - input.startedAt,
        });
        return;
      }
    }
    throw new Error('研究任务没有剩余的已授权预算路由');
  }
}
