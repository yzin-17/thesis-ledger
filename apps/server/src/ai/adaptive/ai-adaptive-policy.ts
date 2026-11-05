import { createHash } from 'node:crypto';
import type { AiGenerationError, AiExecutionTimeoutPolicy } from '@thesis-ledger/schemas';
import type { AiSdkGenerationRequest } from '../ai-sdk-generation.adapter.js';
import { createAiTimeoutPolicy, resolveAiExecutionTimeout } from '../timeout/ai-timeout-policy.js';

export const ADAPTIVE_RULE = {
  version: 'ai-adaptive-v2-shadow',
  mode: 'shadow',
  windowMs: 14 * 86_400_000,
  maxObservations: 512,
  maxProfiles: 256,
} as const;

export type AdaptiveObservation = {
  actualModel?: string | null | undefined;
  requestId: string;
  at: number;
  firstMs: number | null;
  maxGapMs: number | null;
  firstCensored: boolean;
  gapCensored: boolean;
  firstLowerBoundMs?: number | undefined;
  gapLowerBoundMs?: number | undefined;
  completionMs?: number | null | undefined;
  completionCensored?: boolean | undefined;
  completionLowerBoundMs?: number | undefined;
  toolMs?: number | null | undefined;
  toolCensored?: boolean | undefined;
  outcome: 'success' | 'rejected' | 'invalid' | 'unknown';
};
export type AdaptiveHistory = { available: boolean; observations: AdaptiveObservation[] };
export interface AdaptiveObservationStore {
  read(profile: string): Promise<AdaptiveHistory>;
  record(profile: string, observation: AdaptiveObservation): Promise<void>;
  takeRetry(profile: string, requestId: string): Promise<boolean>;
}
export type TimeoutSource = 'route' | 'provider' | 'system';
export type AdaptiveTimeoutSources = {
  executionPolicy?: AiExecutionTimeoutPolicy | undefined;
  firstOutputTimeoutSource?: TimeoutSource | undefined;
  outputIdleTimeoutSource?: TimeoutSource | undefined;
  configurationFingerprint: string;
};

export const adaptiveProfile = (
  request: Pick<
    AiSdkGenerationRequest<unknown>,
    | 'providerId'
    | 'baseURL'
    | 'model'
    | 'contract'
    | 'mode'
    | 'transport'
    | 'reasoningEnabled'
    | 'reasoningEffort'
    | 'messages'
  >,
  fingerprint: string,
) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        version: ADAPTIVE_RULE.version,
        provider: request.providerId,
        destination: request.baseURL,
        model: request.model,
        purpose: request.contract.id,
        mode: request.mode,
        transport: request.transport,
        reasoning: request.reasoningEnabled ?? 'default',
        effort: request.reasoningEffort ?? 'default',
        fingerprint,
      }),
    )
    .digest('hex');

export const adaptiveModelIsFixed = (model: string) =>
  model !== 'openrouter/free' && model !== 'openrouter/auto';

/** 影子计算只展示观测最大值和截尾，不估计P99，也不改变执行阈值。 */
export function adaptiveTimeoutDecision(input: {
  profile: string;
  history: AdaptiveHistory;
  remainingMs: number;
  configured: AiSdkGenerationRequest<unknown>['timeout'];
  sources: AdaptiveTimeoutSources;
  fixed: boolean;
  now: number;
}) {
  if (!Number.isFinite(input.remainingMs) || input.remainingMs <= 0)
    throw new Error('影子计算缺少有效剩余期限');
  const policy = input.sources.executionPolicy ?? createAiTimeoutPolicy('research');
  const decision = resolveAiExecutionTimeout({
    policy,
    now: input.now,
    transport: 'stream',
    taskDeadlineAt: input.now + input.remainingMs + policy.cleanupReserveMs,
    firstOutput: {
      value: input.configured.firstChunkMs,
      source: input.sources.firstOutputTimeoutSource,
    },
    outputIdle: { value: input.configured.chunkMs, source: input.sources.outputIdleTimeoutSource },
  });
  const recent = input.history.observations.filter(
    (item) => item.at <= input.now && item.at >= input.now - ADAPTIVE_RULE.windowMs,
  );
  const dimension = (kind: 'first' | 'gap', baselineMs: number) => {
    const complete = recent.filter(
      (item) => !(kind === 'first' ? item.firstCensored : item.gapCensored),
    );
    const values = complete.flatMap((item) => {
      const value = kind === 'first' ? item.firstMs : item.maxGapMs;
      return value !== null && Number.isFinite(value) && value >= 0 ? [value] : [];
    });
    const censored = recent.filter((item) =>
      kind === 'first' ? item.firstCensored : item.gapCensored,
    ).length;
    const observedMaxMs = values.length ? Math.max(...values) : null;
    return {
      samples: values.length,
      censored,
      observedMaxMs,
      candidateMs: Math.min(input.remainingMs, Math.max(baselineMs, observedMaxMs ?? 0)),
      applied: false as const,
      available: input.history.available,
    };
  };
  return {
    version: ADAPTIVE_RULE.version,
    mode: ADAPTIVE_RULE.mode,
    profile: input.profile,
    first: dimension('first', policy.firstOutputTimeoutMs),
    gap: dimension('gap', policy.outputIdleTimeoutMs),
    timeout: decision.sdkTimeout,
    applied: false as const,
  };
}
export type AdaptiveTimeoutDecision = ReturnType<typeof adaptiveTimeoutDecision>;

export function adaptiveRetryDecision(input: {
  error: AiGenerationError;
  remainingCalls: number;
  remainingMs: number;
  expectedFirstMs: number;
  blocked: boolean;
  cancelled: boolean;
  random: number;
}) {
  const stop = (reason: string) => ({ retry: false, reason, delayMs: 0 });
  if (input.cancelled) return stop('cancelled');
  if (input.blocked) return stop('continuation_blocked');
  if (input.remainingCalls <= 0) return stop('calls_exhausted');
  if (input.error.requestId === null) return stop('request_id_unknown');
  if (
    input.error.code !== 'provider_rejected' ||
    input.error.externalResult !== 'rejected_before_generation'
  )
    return stop('not_confirmed_rejection');
  if (input.remainingMs <= 0) return stop('deadline_exhausted');
  const minimumDelay = input.error.retryAfterMs;
  if (minimumDelay === undefined) return stop('retry_after_unknown');
  const room = input.remainingMs - Math.max(1, input.expectedFirstMs) - minimumDelay;
  if (room <= 0) return stop('insufficient_time');
  const jitter = Math.floor(Math.min(minimumDelay, room) * Math.max(0, Math.min(1, input.random)));
  return { retry: true, reason: 'confirmed_rejection', delayMs: minimumDelay + jitter };
}
