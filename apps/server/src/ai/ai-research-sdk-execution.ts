import { Injectable } from '@nestjs/common';
import { setTimeout as waitForTimeout } from 'node:timers/promises';
import { traceAiOperation } from './trace/ai-trace-context.js';
import {
  type AiGenerationContractRef,
  type AiGenerationMode,
  type AiExecutionSummary,
  type AiResearchPolicyV1,
} from '@thesis-ledger/schemas';
import { AiExecutionStateStore } from './ai-execution-state.store.js';
import { requestHttpDiagnosticFields } from './ai-execution-request-diagnostic.js';
import {
  frozenResearchRouteMatches,
  researchReasoningFields,
} from './ai-research-reasoning-options.js';
import {
  AiSdkGenerationAdapter,
  AiSdkGenerationError,
  type AiSdkGenerationResult,
} from './ai-sdk-generation.adapter.js';
import { readFrozenAiResearchRoutes, researchRoutePaidAuthorized } from './ai-research-policy.js';
import { withGenerationRuntimeDiagnostic } from './ai-generation-failure-diagnostics.js';
import { AiProviderRegistry } from './provider-registry.js';
import { aiProviderPricingForModel, type AiProviderPricing } from './ai-provider-pricing.js';
import {
  researchSdkProtocol,
  buildResearchSdkResult,
  researchSdkAdapterRequest,
  type ResearchExecutionInput,
  type ResearchSdkOutput,
} from './ai-research-sdk-contract.js';
import { researchSdkRequestPlan } from './ai-research-sdk-reservation.js';
import {
  completedResearchCost as completedCost,
  researchUsageRevision as revision,
  researchBlockAfter as blockAfter,
} from './ai-research-sdk-accounting.js';
import { AiAdaptiveExecution } from './adaptive/ai-adaptive-execution.js';
import { researchExecutionDeadline, researchTimeoutPolicy } from './timeout/ai-execution-clock.js';
import { researchFailureCode, researchStopReason } from './timeout/ai-research-lifecycle.js';
import {
  assertResearchResultArrival,
  researchFailureOutcome,
} from './timeout/ai-research-arrival.js';

type ResearchSdkResponseFacts = Pick<
  AiSdkGenerationResult<unknown>,
  | 'usage'
  | 'providerCost'
  | 'providerCostCurrency'
  | 'httpRequest'
  | 'finishReason'
  | 'rawFinishReason'
  | 'actualModel'
>;

type FrozenRoute = ReturnType<typeof readFrozenAiResearchRoutes>[number];

type ResearchAttemptContext = {
  execution: AiExecutionSummary;
  policy: AiResearchPolicyV1;
  deadline: number;
  model: string;
  frozen: FrozenRoute[];
  route: ReturnType<AiProviderRegistry['readyContractCandidates']>[number];
  contract: ReturnType<typeof researchSdkProtocol>['contract'];
};

@Injectable()
export class AiResearchSdkExecution {
  constructor(
    private readonly providers: AiProviderRegistry,
    private readonly adapter: AiSdkGenerationAdapter,
    private readonly executions: AiExecutionStateStore,
    private readonly adaptive: AiAdaptiveExecution = new AiAdaptiveExecution(),
  ) {}

  async execute(input: ResearchExecutionInput) {
    const protocol = researchSdkProtocol(input);
    let execution = protocol.execution;
    const policy = execution.frozenPolicy!;
    const deadline = new Date(execution.deadlineAt!).getTime();
    if (
      execution.requests.some(
        (request) =>
          request.state === 'dispatching' ||
          request.state === 'unknown' ||
          request.error?.externalResult === 'unknown',
      )
    ) {
      await this.executions.failOwned(input.ownership, {
        errorCode: 'research_unknown_outcome',
        errorSummary: '已有请求仍在派发或外部结果未知，不自动补发',
      });
      return;
    }
    if (execution.continuationBlockedReason !== null || execution.generationStatus === 'complete')
      return;
    if (Date.now() >= researchExecutionDeadline(execution)) {
      await this.executions.failOwned(input.ownership, {
        errorCode: 'research_deadline_expired',
        errorSummary: '研究任务执行预算已耗尽，未发送 Provider 请求',
        durationMs: Date.now() - input.startedAt,
        continuationBlockedReason: 'expired',
      });
      return;
    }
    const model = input.run.model;
    if (!model || model === 'pending') throw new Error('研究任务未冻结可执行的 Provider/Model');
    if (input.run.provider === 'pending') throw new Error('研究任务未冻结可执行的Provider');
    const frozen = readFrozenAiResearchRoutes(input.run.modelMetadata);
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
        if (input.run.provider !== 'pending' && provider.id !== input.run.provider) return false;
        if (!provider.sdkRuntime?.()) return false;
        if (frozen.length === 0) return true;
        return frozen.some((candidate) =>
          frozenResearchRouteMatches(candidate, provider.id, model, route),
        );
      })
      .slice(0, 1);
    if (routes.length === 0) throw new Error(`模型 ${model} 没有符合冻结策略的研究路由`);

    const route = routes[0]!;
    const previous = execution.requests.at(-1);
    let retryDelayMs = 0;
    if (previous?.state === 'completed' && previous.error) {
      const decision = await this.retryDecision(
        input,
        execution,
        route,
        previous.error,
        protocol.contract.ref,
        deadline,
        model,
        frozen,
      );
      if (!decision.retry) {
        await this.executions.failOwned(input.ownership, {
          errorCode: `research_${previous.error.code}`,
          errorSummary: previous.error.summary,
        });
        return;
      }
      retryDelayMs = decision.delayMs;
    }
    for (let attempt = 0; attempt < policy.maxAiCalls; attempt++) {
      if (retryDelayMs > 0) await waitForTimeout(retryDelayMs, undefined, { signal: input.signal });
      const attempted = await this.executeAttempt(input, {
        execution,
        policy,
        deadline,
        model,
        frozen,
        route,
        contract: protocol.contract,
      });
      if (attempted.kind === 'stop') return;
      if (attempted.kind === 'retry') {
        execution = attempted.execution;
        retryDelayMs = attempted.delayMs;
      }
    }
    throw new Error('研究任务没有剩余的已授权预算路由');
  }
  private async executeAttempt(input: ResearchExecutionInput, context: ResearchAttemptContext) {
    const { execution, policy, deadline, model, frozen, route, contract } = context;
    if (input.signal.aborted) throw new DOMException('研究任务已取消', 'AbortError');
    const remainingMs = researchExecutionDeadline(execution) - Date.now();
    if (remainingMs <= 0) throw new Error('研究任务已超过创建时冻结的绝对期限');
    const frozenRoute = frozen.find((candidate) =>
      frozenResearchRouteMatches(candidate, route.provider.id, model, route.execution),
    );
    const pricing = frozenRoute?.pricing ?? aiProviderPricingForModel(route.provider, model);
    const planInput = {
      execution,
      policy,
      messages: input.messages,
      pricing,
      provider: route.provider.id,
      model,
      configurationFingerprint: route.execution.readiness.configurationFingerprint,
    };
    let plan;
    try {
      plan = researchSdkRequestPlan(planInput);
    } catch {
      await this.executions.failOwned(input.ownership, {
        errorCode: 'research_budget_exhausted',
        errorSummary: '研究任务没有剩余请求或Token预算',
        continuationBlockedReason: 'budget_exceeded',
      });
      return { kind: 'stop' as const };
    }
    if (!plan) {
      await this.executions.failOwned(input.ownership, {
        errorCode: 'research_budget_exhausted',
        errorSummary: '研究任务费用预留未通过',
        continuationBlockedReason: 'budget_exceeded',
      });
      return { kind: 'stop' as const };
    }
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
    const runtime = route.provider.sdkRuntime?.();
    if (!runtime) return { kind: 'stop' as const };

    let receivedFacts: ResearchSdkResponseFacts | null = null;
    try {
      const generated = await this.adaptive.generate<ResearchSdkOutput>(
        this.adapter,
        researchSdkAdapterRequest({
          requestId,
          providerId: route.provider.id,
          model,
          runtime,
          route: route.execution,
          frozen: frozenRoute,
          contract,
          messages: input.messages,
          signal: input.signal,
          remainingMs,
          outputTokens,
          executionIdentity: input.ownership,
        }),
        {
          ...route.execution,
          executionPolicy: researchTimeoutPolicy(execution),
          configurationFingerprint: route.execution.readiness.configurationFingerprint,
        },
        deadline,
        () => this.executions.authorizeDispatch(input.ownership, requestId),
        (decision) => this.executions.recordTimeoutDecision(input.ownership, requestId, decision),
      );
      if (generated === null) return { kind: 'stop' as const };
      receivedFacts = generated;
      const receivedAt = new Date();
      assertResearchResultArrival({
        execution,
        requestId,
        receivedAt,
        signal: input.signal,
        usage: generated.usage,
        ownership: input.ownership,
      });
      let result: unknown;
      try {
        result = await traceAiOperation(
          'business.result',
          { requestId, provider: route.provider.id, model, output: generated.output },
          () => Promise.resolve(buildResearchSdkResult(input, generated, route.provider.id, model)),
        );
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
        ...requestHttpDiagnosticFields(generated),
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
          receivedAt,
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
        route,
        frozen,
        model,
        contract: contract.ref,
        receivedFacts,
        mode: route.execution.mode,
      });
      if (!fallback) return { kind: 'stop' as const };
      return { kind: 'retry' as const, ...fallback };
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
      route: ResearchAttemptContext['route'];
      frozen: FrozenRoute[];
      model: string;
      contract: AiGenerationContractRef;
      receivedFacts: ResearchSdkResponseFacts | null;
      mode: AiGenerationMode;
    },
  ) {
    const { input, policy, pricing, requestId, deadline, contract, receivedFacts } = context;
    let sdkError =
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
    if (receivedFacts?.httpRequest)
      sdkError = withGenerationRuntimeDiagnostic(
        sdkError,
        context.mode,
        undefined,
        receivedFacts.httpRequest,
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
    if (sdkError.fact.externalResult === 'not_sent') {
      await this.executions.failOwned(input.ownership, {
        errorCode: researchFailureCode(sdkError.fact),
        errorSummary: sdkError.fact.summary,
        requestError: sdkError.fact,
        durationMs: Date.now() - input.startedAt,
        continuationBlockedReason: researchStopReason(sdkError.fact) ?? null,
      });
      return null;
    }
    if (sdkError.fact.externalResult === 'unknown') {
      const continuationBlockedReason = researchStopReason(sdkError.fact);
      await this.executions.markUnknown(
        input.ownership,
        requestId,
        sdkError.fact,
        new Date(),
        revision(observedUsage, cost),
      );
      await this.executions.failOwned(input.ownership, {
        errorCode: researchFailureCode(sdkError.fact),
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
      outcome: researchFailureOutcome(sdkError.fact, receivedFacts, contract, context.model),
      error: sdkError.fact,
    });
    if (!settled) return null;
    const decision = await this.retryDecision(
      input,
      settled.execution,
      context.route,
      sdkError.fact,
      contract,
      deadline,
      context.model,
      context.frozen,
    );
    if (decision.retry) return { execution: settled.execution, delayMs: decision.delayMs };
    const stopped = researchStopReason(sdkError.fact);
    await this.executions.failOwned(input.ownership, {
      errorCode: researchFailureCode(sdkError.fact),
      errorSummary: sdkError.fact.summary,
      durationMs: Date.now() - input.startedAt,
      ...(stopped === undefined ? {} : { continuationBlockedReason: stopped }),
    });
    return null;
  }

  private retryDecision(
    input: ResearchExecutionInput,
    execution: AiExecutionSummary,
    route: ResearchAttemptContext['route'],
    error: AiSdkGenerationError['fact'],
    contract: AiGenerationContractRef,
    deadline: number,
    model: string,
    frozen: FrozenRoute[],
  ) {
    const runtime = route.provider.sdkRuntime?.();
    if (!runtime)
      return Promise.resolve({ retry: false, reason: 'runtime_unavailable', delayMs: 0 });
    const selected = frozen.find((candidate) =>
      frozenResearchRouteMatches(candidate, route.provider.id, model, route.execution),
    );
    return this.adaptive.retry({
      execution,
      error,
      provider: route.provider.id,
      model,
      configurationFingerprint: route.execution.readiness.configurationFingerprint,
      messages: input.messages,
      deadline,
      signal: input.signal,
      route: {
        baseURL: runtime.baseURL,
        contract,
        mode: route.execution.mode,
        ...researchReasoningFields(selected),
      },
    });
  }
}
