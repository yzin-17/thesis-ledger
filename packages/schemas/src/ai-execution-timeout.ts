import { z } from 'zod';

export const AI_TIMEOUT_POLICY_VERSION = 'ai-timeout-v2' as const;
export const AI_MAX_TIMEOUT_MS = 86_400_000;
export const AI_TIMEOUT_CLEANUP_RESERVE_MS = 5_000;
export const aiTimeoutDurationSchema = z.number().int().positive().max(AI_MAX_TIMEOUT_MS);
export const aiTimeoutProfileSchema = z.enum(['connection_probe', 'research', 'deep_research']);
export type AiTimeoutProfile = z.infer<typeof aiTimeoutProfileSchema>;

export const AI_TIMEOUT_BASELINES = {
  connection_probe: {
    connectionTimeoutMs: 10_000,
    firstOutputTimeoutMs: 30_000,
    outputIdleTimeoutMs: 20_000,
    taskBudgetMs: 60_000,
  },
  research: {
    connectionTimeoutMs: 15_000,
    firstOutputTimeoutMs: 120_000,
    outputIdleTimeoutMs: 60_000,
    taskBudgetMs: 600_000,
  },
  deep_research: {
    connectionTimeoutMs: 15_000,
    firstOutputTimeoutMs: 240_000,
    outputIdleTimeoutMs: 90_000,
    taskBudgetMs: 1_200_000,
  },
} as const;

export const aiExecutionTimeoutPolicySchema = z.strictObject({
  version: z.literal(AI_TIMEOUT_POLICY_VERSION),
  profile: aiTimeoutProfileSchema,
  taskBudgetMs: aiTimeoutDurationSchema,
  cleanupReserveMs: z.number().int().nonnegative().max(AI_TIMEOUT_CLEANUP_RESERVE_MS),
  connectionTimeoutMs: aiTimeoutDurationSchema,
  connectionCapability: z.enum(['unavailable', 'independent']),
  firstOutputTimeoutMs: aiTimeoutDurationSchema,
  outputIdleTimeoutMs: aiTimeoutDurationSchema,
  toolTimeoutMs: aiTimeoutDurationSchema,
});
export type AiExecutionTimeoutPolicy = z.infer<typeof aiExecutionTimeoutPolicySchema>;

export const aiExecutionClockSchema = z
  .strictObject({
    policy: aiExecutionTimeoutPolicySchema,
    queueExpiresAt: z.iso.datetime({ offset: true }),
    firstStartedAt: z.iso.datetime({ offset: true }).nullable(),
    taskDeadlineAt: z.iso.datetime({ offset: true }).nullable(),
    origin: z.enum(['first_claim', 'legacy_deadline', 'legacy_start']),
  })
  .superRefine((value, context) => {
    if (
      value.origin !== 'legacy_deadline' &&
      (value.firstStartedAt === null) !== (value.taskDeadlineAt === null)
    )
      context.addIssue({ code: 'custom', message: '首次执行时间与截止时间必须同时确定' });
    if (value.policy.cleanupReserveMs >= value.policy.taskBudgetMs)
      context.addIssue({ code: 'custom', message: '收尾预留必须小于整项执行预算' });
    if (
      value.origin === 'first_claim' &&
      value.firstStartedAt !== null &&
      Date.parse(value.taskDeadlineAt!) !==
        Date.parse(value.firstStartedAt) + value.policy.taskBudgetMs
    )
      context.addIssue({ code: 'custom', message: '首次执行截止时间必须等于首次开始加冻结预算' });
  });
export type AiExecutionClock = z.infer<typeof aiExecutionClockSchema>;

export const aiTimeoutStageSchema = z.enum([
  'connection',
  'first_output',
  'output_idle',
  'completion',
  'tool',
  'task_budget',
]);
export type AiTimeoutStage = z.infer<typeof aiTimeoutStageSchema>;

export const aiTimeoutDiagnosticSchema = z.strictObject({
  version: z.literal(AI_TIMEOUT_POLICY_VERSION),
  profile: aiTimeoutProfileSchema,
  stage: aiTimeoutStageSchema,
  authority: z.enum(['sdk', 'task', 'tool', 'transport']),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  elapsedMs: z.number().finite().nonnegative().nullable(),
  limitMs: aiTimeoutDurationSchema.nullable(),
  deadlineAt: z.iso.datetime({ offset: true }).nullable(),
  taskDeadlineAt: z.iso.datetime({ offset: true }).nullable(),
  remainingMs: z.number().finite().nonnegative().nullable(),
  lastProgressAt: z.iso.datetime({ offset: true }).nullable(),
  runId: z.uuid().nullable().default(null),
  executionAttempt: z.number().int().positive().nullable().default(null),
});
export type AiTimeoutDiagnostic = z.infer<typeof aiTimeoutDiagnosticSchema>;
