import { createHash } from 'node:crypto';
import type { AiGenerationError } from '@thesis-ledger/schemas';
import type { AiSdkGenerationRequest } from '../ai-sdk-generation.adapter.js';

export const ADAPTIVE_RULE = {
  version: 'ai-adaptive-v1',
  coverage: 0.99,
  confidence: 0.95,
  windowMs: 86_400_000,
  maxObservations: 512,
  maxProfiles: 256,
} as const;

export type AdaptiveObservation = {
  requestId: string;
  at: number;
  firstMs: number | null;
  maxGapMs: number | null;
  firstCensored: boolean;
  gapCensored: boolean;
  firstLowerBoundMs?: number | undefined;
  gapLowerBoundMs?: number | undefined;
  outcome: 'success' | 'rejected' | 'invalid' | 'unknown';
};
export type AdaptiveHistory = {
  available: boolean;
  observations: AdaptiveObservation[];
};
export interface AdaptiveObservationStore {
  read(profile: string): Promise<AdaptiveHistory>;
  record(profile: string, observation: AdaptiveObservation): Promise<void>;
  takeRetry(profile: string, requestId: string): Promise<boolean>;
}
export type TimeoutSource = 'route' | 'provider' | 'system';
export type AdaptiveTimeoutSources = {
  firstOutputTimeoutSource?: TimeoutSource | undefined;
  outputIdleTimeoutSource?: TimeoutSource | undefined;
  configurationFingerprint: string;
};
type OutputSource = 'explicit' | 'cold_start' | 'tolerance_bound' | 'censored' | 'unavailable';
export type AdaptiveTimeoutDecision = {
  version: typeof ADAPTIVE_RULE.version;
  profile: string;
  coverage: number;
  confidence: number;
  minimumSamples: number;
  first: {
    source: OutputSource;
    samples: number;
    censored: number;
    deadlineLimited: boolean;
    requestedMs: number;
  };
  gap: {
    source: OutputSource;
    samples: number;
    censored: number;
    deadlineLimited: boolean;
    requestedMs: number;
  };
  timeout: { totalMs: number; firstChunkMs: number; chunkMs: number };
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
        provider: request.providerId,
        destination: request.baseURL,
        model: request.model,
        contract: request.contract,
        mode: request.mode,
        transport: request.transport,
        reasoning: request.reasoningEnabled ?? 'default',
        effort: request.reasoningEffort ?? 'default',
        inputBucket: Math.ceil(
          Math.log2(Math.max(1, Buffer.byteLength(JSON.stringify(request.messages)))),
        ),
        fingerprint,
      }),
    )
    .digest('hex');

export const adaptiveModelIsFixed = (model: string) =>
  model !== 'openrouter/free' && model !== 'openrouter/auto';

export const adaptiveMinimumSamples = (
  coverage = ADAPTIVE_RULE.coverage,
  confidence = ADAPTIVE_RULE.confidence,
) => Math.ceil(Math.log(1 - confidence) / Math.log(coverage));

const explicit = (value: number | undefined, source: TimeoutSource | undefined) =>
  value !== undefined && source !== 'system';

function outputBudget(input: {
  history: AdaptiveHistory;
  dimension: 'first' | 'gap';
  value?: number | undefined;
  source?: TimeoutSource | undefined;
  remainingMs: number;
  now: number;
  fixed: boolean;
}) {
  const recent = input.history.observations.filter(
    (item) => item.at <= input.now && item.at >= input.now - ADAPTIVE_RULE.windowMs,
  );
  const values = recent.flatMap((item) => {
    if (input.dimension === 'first' ? item.firstCensored : item.gapCensored) return [];
    const value = input.dimension === 'first' ? item.firstMs : item.maxGapMs;
    return value !== null && Number.isFinite(value) && value >= 0 ? [value] : [];
  });
  const censored = recent.filter((item) =>
    input.dimension === 'first' ? item.firstCensored : item.gapCensored,
  ).length;
  let source: OutputSource = 'cold_start';
  let budget = input.remainingMs;
  if (explicit(input.value, input.source)) {
    source = 'explicit';
    budget = input.value!;
  } else if (!input.history.available) source = 'unavailable';
  else if (censored > 0) source = 'censored';
  else if (input.fixed && values.length >= adaptiveMinimumSamples()) {
    source = 'tolerance_bound';
    budget = Math.max(...values) + 1;
  }
  return {
    milliseconds: Math.max(1, Math.ceil(Math.min(budget, input.remainingMs))),
    facts: {
      source,
      samples: values.length,
      censored,
      deadlineLimited: budget > input.remainingMs,
      requestedMs: budget,
    },
  };
}

export function adaptiveTimeoutDecision(input: {
  profile: string;
  history: AdaptiveHistory;
  remainingMs: number;
  configured: AiSdkGenerationRequest<unknown>['timeout'];
  sources: AdaptiveTimeoutSources;
  fixed: boolean;
  now: number;
}): AdaptiveTimeoutDecision {
  if (!Number.isFinite(input.remainingMs) || input.remainingMs <= 0)
    throw new Error('自适应执行缺少有效剩余期限');
  const common = {
    history: input.history,
    remainingMs: input.remainingMs,
    now: input.now,
    fixed: input.fixed,
  };
  const first = outputBudget({
    ...common,
    dimension: 'first',
    value: input.configured.firstChunkMs,
    source: input.sources.firstOutputTimeoutSource,
  });
  const gap = outputBudget({
    ...common,
    dimension: 'gap',
    value: input.configured.chunkMs,
    source: input.sources.outputIdleTimeoutSource,
  });
  return {
    version: ADAPTIVE_RULE.version,
    profile: input.profile,
    coverage: ADAPTIVE_RULE.coverage,
    confidence: ADAPTIVE_RULE.confidence,
    minimumSamples: adaptiveMinimumSamples(),
    first: first.facts,
    gap: gap.facts,
    timeout: {
      totalMs: Math.ceil(input.remainingMs),
      firstChunkMs: first.milliseconds,
      chunkMs: gap.milliseconds,
    },
  };
}

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
