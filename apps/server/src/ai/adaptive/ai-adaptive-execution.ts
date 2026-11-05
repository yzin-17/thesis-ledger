import type { AiExecutionSummary, AiGenerationError } from '@thesis-ledger/schemas';
import { createHash, randomUUID } from 'node:crypto';
import { traceAiOperation } from '../trace/ai-trace-context.js';
import {
  AiSdkGenerationError,
  type AiSdkGenerationAdapter,
  type AiSdkGenerationRequest,
} from '../ai-sdk-generation.adapter.js';
import { researchRequestTotals } from '../ai-research-sdk-reservation.js';
import { MemoryAdaptiveObservationStore } from './ai-adaptive-history.store.js';
import { AiAdaptiveObservation } from './ai-adaptive-observation.js';
import {
  aiTimeoutProfileFor,
  createAiTimeoutPolicy,
  resolveAiExecutionTimeout,
  type AiExecutionTimeoutDecision,
} from '../timeout/ai-timeout-policy.js';
import { createAiTimeoutScope } from '../timeout/ai-timeout-scope.js';
import { AiGenerationTiming } from '../timeout/ai-generation-timing.js';
import {
  adaptiveModelIsFixed,
  adaptiveTimeoutDecision,
  adaptiveProfile,
  adaptiveRetryDecision,
  ADAPTIVE_RULE,
  type AdaptiveObservationStore,
  type AdaptiveObservation,
  type AdaptiveTimeoutSources,
} from './ai-adaptive-policy.js';

/** 负责反馈策略；每次真实发送仍由调用者的执行账本预留并授权。 */
export class AiAdaptiveExecution {
  constructor(
    private readonly observations: AdaptiveObservationStore = new MemoryAdaptiveObservationStore(),
  ) {}

  private async history(profile: string) {
    try {
      return await this.observations.read(profile);
    } catch {
      return { available: false, observations: [] };
    }
  }

  private assertBeforeSend(
    input: AiSdkGenerationRequest<unknown>,
    scope: ReturnType<typeof createAiTimeoutScope>,
  ) {
    try {
      scope.assertActive();
    } catch (error) {
      const fact = new AiGenerationTiming({ ...input, signal: scope.signal }).interruption(error);
      throw new AiSdkGenerationError(
        {
          ...(fact ?? {
            code: 'task_budget_exhausted',
            phase: 'preflight',
            requestId: input.requestId,
            summary: '任务执行预算不足，未发送Provider请求',
          }),
          externalResult: 'not_sent',
        },
        undefined,
        { cause: error },
      );
    }
  }

  private async observe(profile: string, observation: AdaptiveObservation) {
    try {
      await this.observations.record(profile, observation);
    } catch {
      /* 运行缓存失败不覆盖Provider事实或业务结果。 */
    }
  }

  observeTool(
    tool: string,
    observation: { durationMs: number; censored: boolean; succeeded: boolean },
  ) {
    const profile = createHash('sha256')
      .update(JSON.stringify({ version: ADAPTIVE_RULE.version, purpose: 'research_tool', tool }))
      .digest('hex');
    void this.observe(profile, {
      requestId: randomUUID(),
      at: Date.now(),
      firstMs: null,
      maxGapMs: null,
      firstCensored: false,
      gapCensored: false,
      toolMs: observation.durationMs,
      toolCensored: observation.censored,
      outcome: observation.succeeded ? 'success' : 'unknown',
    });
  }

  private async takeRetry(profile: string, requestId: string) {
    try {
      return await this.observations.takeRetry(profile, requestId);
    } catch {
      return false;
    }
  }

  async generate<T>(
    adapter: AiSdkGenerationAdapter,
    input: AiSdkGenerationRequest<T>,
    sources: AdaptiveTimeoutSources,
    deadline: number,
    authorize?: () => Promise<boolean>,
    recordDecision?: (decision: AiExecutionTimeoutDecision) => Promise<boolean>,
  ) {
    const profile = adaptiveProfile(input, sources.configurationFingerprint);
    const policy = sources.executionPolicy ?? createAiTimeoutPolicy(aiTimeoutProfileFor(input));
    const scope = createAiTimeoutScope({
      policy,
      taskDeadlineAt: deadline,
      signal: input.signal,
      ...input.executionIdentity,
    });
    let observation: AiAdaptiveObservation | undefined;
    try {
      this.assertBeforeSend(input, scope);
      const history = await this.history(profile);
      this.assertBeforeSend(input, scope);
      const authorized = authorize ? await authorize() : true;
      this.assertBeforeSend(input, scope);
      if (!authorized) return null;
      const decision = resolveAiExecutionTimeout({
        policy,
        taskDeadlineAt: deadline,
        transport: input.transport,
        firstOutput: {
          value: input.timeout.firstChunkMs,
          source: sources.firstOutputTimeoutSource,
        },
        outputIdle: { value: input.timeout.chunkMs, source: sources.outputIdleTimeoutSource },
      });
      const recorded = recordDecision ? await recordDecision(decision) : true;
      this.assertBeforeSend(input, scope);
      if (!recorded) return null;
      observation = new AiAdaptiveObservation(
        input.requestId,
        input.model,
        Date.now,
        input.transport,
      );
      const result = await adapter.generate({
        ...input,
        signal: scope.signal,
        timeout: decision.sdkTimeout,
        timeoutDecision: decision,
        adaptiveExecution: adaptiveTimeoutDecision({
          profile,
          history,
          remainingMs: decision.remainingMs,
          configured: input.timeout,
          sources: { ...sources, executionPolicy: policy },
          fixed: adaptiveModelIsFixed(input.model),
          now: decision.resolvedAt,
        }),
        onProgress: (progress) => {
          observation!.progress(progress);
          input.onProgress?.(progress);
        },
      });
      observation.succeeded(result);
      return result;
    } catch (error) {
      observation?.failed(error);
      throw error;
    } finally {
      scope.close();
      if (observation) void this.observe(observation.profile(profile), observation.snapshot());
    }
  }

  async retry(input: {
    execution: AiExecutionSummary;
    error: AiGenerationError;
    provider: string;
    model: string;
    configurationFingerprint: string;
    messages: unknown[];
    route: Pick<
      AiSdkGenerationRequest<unknown>,
      'baseURL' | 'contract' | 'mode' | 'reasoningEnabled' | 'reasoningEffort'
    >;
    deadline: number;
    signal: AbortSignal;
  }) {
    const profile = adaptiveProfile(
      {
        ...input.route,
        providerId: input.provider,
        model: input.model,
        messages: input.messages,
        transport: 'stream',
      },
      input.configurationFingerprint,
    );
    const history = await this.history(profile);
    const remainingMs =
      input.deadline - Date.now() - (input.execution.timing?.policy.cleanupReserveMs ?? 5_000);
    const remainingCalls =
      (input.execution.frozenPolicy?.maxAiCalls ?? 0) -
      researchRequestTotals(input.execution).calls;
    const now = Date.now();
    const completed = history.observations.filter(
      (item) =>
        !item.firstCensored &&
        item.firstMs !== null &&
        item.at <= now &&
        item.at >= now - ADAPTIVE_RULE.windowMs,
    );
    const expectedFirstMs = Math.max(
      (input.execution.timing?.policy ?? createAiTimeoutPolicy(aiTimeoutProfileFor(input.route)))
        .firstOutputTimeoutMs,
      ...completed.map((item) => item.firstMs!),
    );
    let decision = adaptiveRetryDecision({
      error: input.error,
      remainingCalls,
      remainingMs,
      expectedFirstMs,
      blocked: input.execution.continuationBlockedReason !== null,
      cancelled: input.signal.aborted,
      random: Math.random(),
    });
    if (!adaptiveModelIsFixed(input.model))
      decision = { retry: false, reason: 'dynamic_model', delayMs: 0 };
    else if (!history.available)
      decision = { retry: false, reason: 'history_unavailable', delayMs: 0 };
    else if (
      decision.retry &&
      (input.error.requestId === null || !(await this.takeRetry(profile, input.error.requestId)))
    )
      decision = { retry: false, reason: 'retry_quota_exhausted', delayMs: 0 };
    return traceAiOperation(
      'business.execution',
      {
        operation: 'adaptive_retry',
        requestId: input.error.requestId,
        profile,
        remainingCalls,
        remainingMs,
        expectedFirstMs,
        expectedFirstSource: completed.length > 0 ? 'observed_max' : 'purpose_baseline',
      },
      () => Promise.resolve(decision),
    );
  }
}
