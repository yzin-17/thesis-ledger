import { Injectable } from '@nestjs/common';
import {
  type AiCostFacts,
  type AiGenerationContractRef,
  type AiExecutionSummary,
  type AiResearchPolicyV1,
  type AiUsageFacts,
} from '@thesis-ledger/schemas';
import { AiExecutionStateStore } from './ai-execution-state.store.js';
import {
  AiSdkGenerationAdapter,
  AiSdkGenerationError,
  type AiSdkGenerationResult,
} from './ai-sdk-generation.adapter.js';
import { researchRoutePaidAuthorized } from './ai-research-policy.js';
import { AiProviderRegistry } from './provider-registry.js';
import { aiProviderPricingForModel, type AiProviderPricing } from './ai-provider-pricing.js';
import {
  researchSdkProtocol,
  buildResearchSdkResult,
  type ResearchExecutionInput,
  type ResearchSdkOutput,
} from './ai-research-sdk-contract.js';
import {
  researchRequestTotals as requestTotals,
  researchRouteCost as routeCost,
  researchSdkRequestPlan,
} from './ai-research-sdk-reservation.js';

type ResearchSdkResponseFacts = Pick<
  AiSdkGenerationResult<unknown>,
  'usage' | 'providerCost' | 'providerCostCurrency'
>;

type FrozenRoute = {
  provider: string;
  model: string;
  configurationFingerprint: string;
  adapter?: string;
  mode?: string;
  pricing?: AiProviderPricing;
};

type ResearchAttemptContext = {
  execution: AiExecutionSummary;
  policy: AiResearchPolicyV1;
  deadline: number;
  model: string;
  frozen: FrozenRoute[];
  route: ReturnType<AiProviderRegistry['readyContractCandidates']>[number];
  index: number;
  routeCount: number;
  contract: ReturnType<typeof researchSdkProtocol>['contract'];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const pricingSnapshot = (value: unknown): AiProviderPricing | undefined => {
  const pricing = asRecord(value);
  if (!pricing) return undefined;
  return {
    ...(typeof pricing.costPer1kInput === 'number'
      ? { costPer1kInput: pricing.costPer1kInput }
      : {}),
    ...(typeof pricing.costPer1kOutput === 'number'
      ? { costPer1kOutput: pricing.costPer1kOutput }
      : {}),
    ...(typeof pricing.costCurrency === 'string' ? { costCurrency: pricing.costCurrency } : {}),
    ...(typeof pricing.pricingVersion === 'string'
      ? { pricingVersion: pricing.pricingVersion }
      : {}),
  };
};

const frozenRoutes = (metadata: unknown): FrozenRoute[] => {
  const value = asRecord(metadata)?.researchRoutes;
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const route = asRecord(candidate);
    const pricing = pricingSnapshot(route?.pricing);
    return typeof route?.provider === 'string' &&
      typeof route.model === 'string' &&
      typeof route.configurationFingerprint === 'string'
      ? [
          {
            provider: route.provider,
            model: route.model,
            configurationFingerprint: route.configurationFingerprint,
            ...(typeof route.adapter === 'string' ? { adapter: route.adapter } : {}),
            ...(typeof route.mode === 'string' ? { mode: route.mode } : {}),
            ...(pricing === undefined ? {} : { pricing }),
          },
        ]
      : [];
  });
};

const unknownCost = (source: string | null = null): AiCostFacts => ({
  status: 'unknown',
  amount: null,
  currency: null,
  source,
  pricingVersion: null,
});

const completedCost = (
  policy: AiResearchPolicyV1,
  pricing: AiProviderPricing,
  result: Pick<AiSdkGenerationResult<unknown>, 'providerCost' | 'providerCostCurrency' | 'usage'>,
): AiCostFacts => {
  if (
    result.providerCost !== null &&
    result.providerCostCurrency !== null &&
    (policy.costCurrency === null || result.providerCostCurrency === policy.costCurrency)
  )
    return {
      status: 'known',
      amount: result.providerCost,
      currency: result.providerCostCurrency,
      source: 'provider_reported',
      pricingVersion: pricing.pricingVersion ?? null,
    };
  if (result.usage.inputTokens !== null && result.usage.outputTokens !== null) {
    const estimate = routeCost(
      policy,
      pricing,
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
  usage: AiUsageFacts,
  cost: AiCostFacts,
  reservation: { inputTokens: number; outputTokens: number; cost: AiCostFacts },
  requestId: string,
): AiExecutionSummary['continuationBlockedReason'] => {
  const totals = requestTotals({
    ...execution,
    requests: execution.requests.filter((request) => request.requestId !== requestId),
  });
  const input = totals.input + (usage.inputTokens ?? reservation.inputTokens);
  const output = totals.output + (usage.outputTokens ?? reservation.outputTokens);
  const amount = totals.cost + Number(cost.amount ?? reservation.cost.amount ?? 0);
  if (
    input > policy.maxInputTokens ||
    output > policy.maxOutputTokens ||
    amount > Number(policy.maxCost)
  )
    return 'budget_exceeded';
  if (cost.status === 'unknown') return 'cost_unknown';
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
    const protocol = researchSdkProtocol(input);
    let execution = protocol.execution;
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
    const model = input.run.model;
    if (!model || model === 'pending') throw new Error('研究任务未冻结可执行的 Provider/Model');
    const frozen = frozenRoutes(input.run.modelMetadata);
    const attemptedProviders = new Set(
      execution.requests
        .filter((request) => request.state !== 'prepared')
        .map((request) => request.reservation.provider)
        .filter((provider): provider is string => typeof provider === 'string'),
    );
    const routes = this.providers
      .readyContractCandidates({
        model,
        contract: protocol.contract.ref,
        ...(input.run.provider === 'pending' ? {} : { preferred: input.run.provider }),
        budgetAuthorized: (providerId, candidateModel) =>
          frozen.some(
            (candidate) =>
              candidate.provider === providerId &&
              candidate.model === candidateModel &&
              candidate.pricing !== undefined,
          )
            ? true
            : researchRoutePaidAuthorized(policy, providerId, candidateModel),
      })
      .filter(({ provider, execution: route }) => {
        if (attemptedProviders.has(provider.id)) return false;
        if (!provider.sdkRuntime?.()) return false;
        if (frozen.length === 0) return true;
        return frozen.some(
          (candidate) =>
            candidate.provider === provider.id &&
            candidate.model === model &&
            (candidate.adapter === undefined || candidate.adapter === route.adapter) &&
            (candidate.mode === undefined || candidate.mode === route.mode) &&
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
      const attempted = await this.executeAttempt(input, {
        execution,
        policy,
        deadline,
        model,
        frozen,
        route,
        index,
        routeCount: routes.length,
        contract: protocol.contract,
      });
      if (attempted.kind === 'stop') return;
      if (attempted.kind === 'fallback') {
        execution = attempted.execution;
        fallbackDelayMs = attempted.fallbackDelayMs;
      }
    }
    throw new Error('研究任务没有剩余的已授权预算路由');
  }
  private async executeAttempt(input: ResearchExecutionInput, context: ResearchAttemptContext) {
    const { execution, policy, deadline, model, frozen, route, index, routeCount, contract } =
      context;
    if (input.signal.aborted) throw new DOMException('研究任务已取消', 'AbortError');
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error('研究任务已超过创建时冻结的绝对期限');
    const frozenRoute = frozen.find(
      (candidate) =>
        candidate.provider === route.provider.id &&
        candidate.model === model &&
        candidate.configurationFingerprint === route.execution.readiness.configurationFingerprint,
    );
    const pricing = frozenRoute?.pricing ?? aiProviderPricingForModel(route.provider, model);
    const plan = researchSdkRequestPlan({
      execution,
      policy,
      messages: input.messages,
      pricing,
      provider: route.provider.id,
      model,
      configurationFingerprint: route.execution.readiness.configurationFingerprint,
    });
    if (!plan) return { kind: 'skip' as const };
    const { requestId, reservation } = plan;
    const { inputTokens, outputTokens, cost: reservationCost } = reservation;
    if (!plan.alreadyPrepared) {
      const prepared = await this.executions.prepareRequest({
        ...input.ownership,
        requestId,
        reservation,
      });
      if (!prepared) return { kind: 'stop' as const };
    }
    const authorized = await this.executions.authorizeDispatch(input.ownership, requestId);
    if (!authorized) return { kind: 'stop' as const };
    const runtime = route.provider.sdkRuntime?.();
    if (!runtime) return { kind: 'stop' as const };

    let receivedFacts: ResearchSdkResponseFacts | null = null;
    try {
      const generated = await this.adapter.generate<ResearchSdkOutput>({
        requestId,
        adapter: route.execution.adapter,
        ...(route.execution.compatibilityExtensionProfile === undefined
          ? {}
          : {
              compatibilityExtensionProfile: route.execution.compatibilityExtensionProfile,
            }),
        providerId: route.provider.id,
        baseURL: runtime.baseURL,
        authMode: runtime.authMode ?? 'api_key',
        apiKey: runtime.apiKey,
        model,
        messages: input.messages,
        contract: contract.ref,
        schema: contract.schema,
        mode: route.execution.mode,
        transport: 'stream',
        maxOutputTokens: outputTokens,
        timeout: {
          // 「超时（毫秒）」是 Provider 级的一次性探测预算，不能当成流式研究生成的总时长墙：
          // 本地推理模型的 research 用途探针实测 43～103 秒（思考 token 与正文共用输出预算），
          // 用 30 秒总时长必然把正常生成误杀成「生成请求已取消」。
          // 「卡住」交给首块 / 块间停顿（firstChunkMs / chunkMs）判活，
          // 这里的总时长只兜住创建时冻结的绝对期限——一直在出字就不该被掐断。
          totalMs: remainingMs,
          ...(route.execution.firstOutputTimeoutMs === undefined
            ? {}
            : { firstChunkMs: route.execution.firstOutputTimeoutMs }),
          ...(route.execution.outputIdleTimeoutMs === undefined
            ? {}
            : { chunkMs: route.execution.outputIdleTimeoutMs }),
        },
        signal: input.signal,
      });
      receivedFacts = generated;
      let result: unknown;
      try {
        result = buildResearchSdkResult(input, generated, route.provider.id, model);
      } catch (error) {
        throw new AiSdkGenerationError(
          {
            code: 'business_invalid',
            phase: 'validation',
            summary: error instanceof Error ? error.message.slice(0, 500) : '研究结果业务校验失败',
            externalResult: 'complete',
            requestId,
          },
          generated.usage,
          { cause: error },
        );
      }
      const cost = completedCost(policy, pricing, generated);
      const blocked = blockAfter(
        execution,
        policy,
        generated.usage,
        cost,
        {
          inputTokens,
          outputTokens,
          cost: reservationCost,
        },
        requestId,
      );
      await this.executions.completeAndSettle({
        ...input.ownership,
        requestId,
        revision: revision(generated.usage, cost),
        outcome: {
          status: 'complete',
          finishReason: generated.rawFinishReason ?? generated.finishReason,
          contract: contract.ref,
          schemaAccepted: true,
          actualModel: generated.actualModel ?? model,
        },
        result,
        continuationBlockedReason: blocked,
        finalization: {
          provider: route.provider.id,
          model,
          durationMs: Date.now() - input.startedAt,
        },
      });
      return { kind: 'stop' as const };
    } catch (error) {
      const fallback = await this.settleFailure(error, {
        input,
        policy,
        pricing,
        requestId,
        deadline,
        index,
        routeCount,
        contract: contract.ref,
        receivedFacts,
      });
      if (!fallback) return { kind: 'stop' as const };
      return { kind: 'fallback' as const, ...fallback };
    }
  }

  private async settleFailure(
    error: unknown,
    context: {
      input: ResearchExecutionInput;
      policy: AiResearchPolicyV1;
      pricing: AiProviderPricing;
      requestId: string;
      deadline: number;
      index: number;
      routeCount: number;
      contract: AiGenerationContractRef;
      receivedFacts: ResearchSdkResponseFacts | null;
    },
  ) {
    const {
      input,
      policy,
      pricing,
      requestId,
      deadline,
      index,
      routeCount,
      contract,
      receivedFacts,
    } = context;
    const sdkError =
      error instanceof AiSdkGenerationError
        ? error
        : new AiSdkGenerationError(
            {
              code: 'persistence_failed',
              phase: 'persistence',
              summary: error instanceof Error ? error.message.slice(0, 500) : '研究结果保存失败',
              externalResult: 'unknown',
              requestId,
            },
            { status: 'unknown', inputTokens: null, outputTokens: null },
            { cause: error },
          );
    const observedUsage = receivedFacts?.usage ?? sdkError.usage;
    const cost = completedCost(
      policy,
      pricing,
      receivedFacts ?? {
        providerCost: null,
        providerCostCurrency: null,
        usage: observedUsage,
      },
    );
    if (sdkError.fact.externalResult === 'unknown') {
      let continuationBlockedReason: 'expired' | 'cancelled' | undefined;
      if (Date.now() >= deadline) continuationBlockedReason = 'expired';
      else if (sdkError.fact.code === 'cancelled') continuationBlockedReason = 'cancelled';
      await this.executions.markUnknown(
        input.ownership,
        requestId,
        sdkError.fact,
        new Date(),
        revision(observedUsage, cost),
      );
      await this.executions.failOwned(input.ownership, {
        errorCode: 'research_unknown_outcome',
        errorSummary: sdkError.fact.summary,
        durationMs: Date.now() - input.startedAt,
        ...(continuationBlockedReason ? { continuationBlockedReason } : {}),
      });
      return null;
    }
    const settled = await this.executions.completeAndSettle({
      ...input.ownership,
      requestId,
      revision: revision(observedUsage, cost),
      outcome: {
        status: 'incomplete',
        finishReason: sdkError.fact.code,
        contract,
        schemaAccepted: false,
      },
      error: sdkError.fact,
    });
    if (!settled) return null;
    const canFallback =
      index === 0 &&
      sdkError.fact.code === 'provider_rejected' &&
      sdkError.fact.externalResult === 'rejected_before_generation' &&
      routeCount > 1;
    if (canFallback)
      return { execution: settled.execution, fallbackDelayMs: sdkError.fact.retryAfterMs ?? 0 };
    await this.executions.failOwned(input.ownership, {
      errorCode: `research_${sdkError.fact.code}`,
      errorSummary: sdkError.fact.summary,
      durationMs: Date.now() - input.startedAt,
    });
    return null;
  }
}
