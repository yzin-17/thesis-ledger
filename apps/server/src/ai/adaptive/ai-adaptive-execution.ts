import type { AiExecutionSummary, AiGenerationError } from '@thesis-ledger/schemas';
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
  adaptiveModelIsFixed,
  adaptiveProfile,
  adaptiveTimeoutDecision,
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

  private assertBeforeSend(input: AiSdkGenerationRequest<unknown>, deadline: number) {
    if (input.signal.aborted || Date.now() >= deadline)
      throw new AiSdkGenerationError({
        code: 'cancelled',
        phase: 'cancellation',
        externalResult: 'not_sent',
        requestId: input.requestId,
        summary: '任务已取消或超过冻结期限，未发送Provider请求',
      });
  }

  private async observe(profile: string, observation: AdaptiveObservation) {
    try {
      await this.observations.record(profile, observation);
    } catch {
      /* 运行缓存失败不覆盖Provider事实或业务结果。 */
    }
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
  ) {
    const profile = adaptiveProfile(input, sources.configurationFingerprint);
    const history = await this.history(profile);
    this.assertBeforeSend(input, deadline);
    if (authorize && !(await authorize())) return null;
    this.assertBeforeSend(input, deadline);
    const decision = adaptiveTimeoutDecision({
      profile,
      history,
      remainingMs: deadline - Date.now(),
      configured: input.timeout,
      sources,
      fixed: adaptiveModelIsFixed(input.model),
      now: Date.now(),
    });
    const observation = new AiAdaptiveObservation(input.requestId, input.model);
    try {
      const result = await adapter.generate({
        ...input,
        signal: AbortSignal.any([
          input.signal,
          AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        ]),
        timeout: decision.timeout,
        adaptiveExecution: decision,
        onProgress: (progress) => {
          observation.progress(progress);
          input.onProgress?.(progress);
        },
      });
      observation.succeeded(result);
      return result;
    } catch (error) {
      observation.failed(error);
      throw error;
    } finally {
      const sample = observation.snapshot();
      if (sample) void this.observe(profile, sample);
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
    const remainingMs = input.deadline - Date.now();
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
    const expectedFirstMs =
      completed.length > 0
        ? Math.max(...completed.map((item) => item.firstMs!))
        : Math.max(1, remainingMs / (remainingCalls + 1));
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
        expectedFirstSource: completed.length > 0 ? 'observed_max' : 'remaining_budget_share',
      },
      () => Promise.resolve(decision),
    );
  }
}
