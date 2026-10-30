import {
  AI_MAX_TIMEOUT_MS,
  AI_TIMEOUT_BASELINES,
  AI_TIMEOUT_CLEANUP_RESERVE_MS,
  AI_TIMEOUT_POLICY_VERSION,
  aiExecutionTimeoutPolicySchema,
  type AiExecutionTimeoutPolicy,
  type AiTimeoutProfile,
} from '@thesis-ledger/schemas';

export type AiTimeoutSource = 'route' | 'provider' | 'system' | 'legacy' | 'profile';
export type AiTimeoutOverride = {
  value?: number | undefined;
  source?: AiTimeoutSource | undefined;
};
export type AiTimeoutLimit = {
  baselineMs: number;
  overrideMs: number | null;
  source: AiTimeoutSource;
  effectiveMs: number;
  deadlineAt: number;
  clipped: boolean;
};

export const aiTimeoutProfileFor = (input: {
  connectionProbe?: boolean | undefined;
  reasoningEnabled?: boolean | undefined;
  reasoningEffort?: string | undefined;
}): AiTimeoutProfile => {
  if (input.connectionProbe) return 'connection_probe';
  if (input.reasoningEnabled === false || input.reasoningEffort === 'none') return 'research';
  if (
    input.reasoningEnabled === true ||
    ['high', 'xhigh', 'max'].includes(input.reasoningEffort ?? '')
  )
    return 'deep_research';
  return 'research';
};

export function createAiTimeoutPolicy(
  profile: AiTimeoutProfile,
  taskBudgetMs: number = AI_TIMEOUT_BASELINES[profile].taskBudgetMs,
): AiExecutionTimeoutPolicy {
  return aiExecutionTimeoutPolicySchema.parse({
    version: AI_TIMEOUT_POLICY_VERSION,
    profile,
    ...AI_TIMEOUT_BASELINES[profile],
    taskBudgetMs,
    cleanupReserveMs: AI_TIMEOUT_CLEANUP_RESERVE_MS,
    connectionCapability: 'unavailable',
    toolTimeoutMs: 20_000,
  });
}

const limit = (
  baselineMs: number,
  override: AiTimeoutOverride,
  now: number,
  remainingMs: number,
) => {
  const explicit = override.value !== undefined && override.source !== 'system';
  const requested = explicit ? override.value! : baselineMs;
  if (!Number.isSafeInteger(requested) || requested <= 0 || requested > AI_MAX_TIMEOUT_MS)
    throw new Error('AI 阶段等待必须为有效的毫秒预算');
  const effectiveMs = Math.max(0, Math.min(requested, remainingMs));
  return {
    baselineMs,
    overrideMs: explicit ? requested : null,
    source: explicit ? (override.source ?? 'legacy') : 'profile',
    effectiveMs,
    deadlineAt: now + effectiveMs,
    clipped: requested > remainingMs,
  } satisfies AiTimeoutLimit;
};

/** 统一计算规则；只生成决策，SDK阶段计时与任务责任方分别执行各自期限。 */
export function resolveAiExecutionTimeout(input: {
  policy: AiExecutionTimeoutPolicy;
  taskDeadlineAt: number;
  now?: number | undefined;
  transport: 'stream' | 'single';
  firstOutput?: AiTimeoutOverride | undefined;
  outputIdle?: AiTimeoutOverride | undefined;
  completion?: AiTimeoutOverride | undefined;
}) {
  const now = input.now ?? Date.now();
  if (!Number.isFinite(input.taskDeadlineAt)) throw new Error('AI 缺少有效任务截止时间');
  const executionDeadlineAt = input.taskDeadlineAt - input.policy.cleanupReserveMs;
  const remainingMs = Math.max(0, Math.floor(executionDeadlineAt - now));
  const first = limit(input.policy.firstOutputTimeoutMs, input.firstOutput ?? {}, now, remainingMs);
  const idle = limit(input.policy.outputIdleTimeoutMs, input.outputIdle ?? {}, now, remainingMs);
  const completion = limit(remainingMs || 1, input.completion ?? {}, now, remainingMs);
  const sdkTimeout: { totalMs?: number; firstChunkMs?: number; chunkMs?: number } = {};
  if (input.transport === 'stream') {
    if (first.effectiveMs < remainingMs) sdkTimeout.firstChunkMs = first.effectiveMs;
    if (idle.effectiveMs < remainingMs) sdkTimeout.chunkMs = idle.effectiveMs;
  } else if (completion.effectiveMs < remainingMs) sdkTimeout.totalMs = completion.effectiveMs;
  return {
    version: AI_TIMEOUT_POLICY_VERSION,
    profile: input.policy.profile,
    transport: input.transport,
    policy: input.policy,
    resolvedAt: now,
    taskDeadlineAt: input.taskDeadlineAt,
    executionDeadlineAt,
    remainingMs,
    canStart: remainingMs > 0,
    connection: {
      requestedMs: input.policy.connectionTimeoutMs,
      effectiveMs: null,
      capability: input.policy.connectionCapability,
    },
    first: input.transport === 'stream' ? first : null,
    idle: input.transport === 'stream' ? idle : null,
    completion: input.transport === 'single' ? completion : null,
    sdkTimeout,
  };
}
export type AiExecutionTimeoutDecision = ReturnType<typeof resolveAiExecutionTimeout>;
