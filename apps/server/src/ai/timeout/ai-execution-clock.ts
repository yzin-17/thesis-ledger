import {
  aiExecutionClockSchema,
  aiExecutionSummarySchema,
  type AiExecutionSummary,
  type AiResearchPolicyV1,
  AI_TIMEOUT_CLEANUP_RESERVE_MS,
} from '@thesis-ledger/schemas';
import { aiTimeoutProfileFor, createAiTimeoutPolicy } from './ai-timeout-policy.js';

type Reasoning = { reasoningEnabled?: boolean | undefined; reasoningEffort?: string | undefined };

export const queuedResearchClock = (
  policy: AiResearchPolicyV1,
  reasoning: Reasoning = {},
  now = Date.now(),
) =>
  aiExecutionClockSchema.parse({
    policy: createAiTimeoutPolicy(
      aiTimeoutProfileFor(reasoning),
      policy.maxDurationSeconds * 1_000,
    ),
    queueExpiresAt: new Date(now + policy.maxDurationSeconds * 1_000).toISOString(),
    firstStartedAt: null,
    taskDeadlineAt: null,
    origin: 'first_claim',
  });

export function startResearchClock(input: {
  execution: AiExecutionSummary;
  firstStartedAt: Date | null;
  executionAttempt: number;
  now: number;
}) {
  const execution = input.execution;
  if (!execution.frozenPolicy) throw new Error('研究任务缺少冻结执行预算');
  let timing = execution.timing;
  if (timing?.taskDeadlineAt) {
    if (execution.deadlineAt && execution.deadlineAt !== timing.taskDeadlineAt)
      throw new Error('持久化研究截止时间不一致');
    return aiExecutionSummarySchema.parse({ ...execution, deadlineAt: timing.taskDeadlineAt });
  }
  if (execution.deadlineAt) {
    timing = aiExecutionClockSchema.parse({
      policy: createAiTimeoutPolicy('research', execution.frozenPolicy.maxDurationSeconds * 1_000),
      queueExpiresAt: execution.deadlineAt,
      firstStartedAt: input.firstStartedAt?.toISOString() ?? null,
      taskDeadlineAt: execution.deadlineAt,
      origin: 'legacy_deadline',
    });
  } else if (timing) {
    if (Date.parse(timing.queueExpiresAt) <= input.now) return null;
    if (input.executionAttempt > 0 && input.firstStartedAt === null)
      throw new Error('恢复任务缺少可证明的首次执行时间');
    const first = input.firstStartedAt?.getTime() ?? input.now;
    timing = aiExecutionClockSchema.parse({
      ...timing,
      firstStartedAt: new Date(first).toISOString(),
      taskDeadlineAt: new Date(first + timing.policy.taskBudgetMs).toISOString(),
    });
  } else {
    if (input.firstStartedAt === null) throw new Error('历史任务缺少首次执行时间及冻结截止时间');
    timing = aiExecutionClockSchema.parse({
      policy: createAiTimeoutPolicy('research', execution.frozenPolicy.maxDurationSeconds * 1_000),
      queueExpiresAt: input.firstStartedAt.toISOString(),
      firstStartedAt: input.firstStartedAt.toISOString(),
      taskDeadlineAt: new Date(
        input.firstStartedAt.getTime() + execution.frozenPolicy.maxDurationSeconds * 1_000,
      ).toISOString(),
      origin: 'legacy_start',
    });
  }
  return aiExecutionSummarySchema.parse({
    ...execution,
    timing,
    deadlineAt: timing.taskDeadlineAt,
  });
}

export const researchExecutionDeadline = (execution: AiExecutionSummary) => {
  if (!execution.deadlineAt) throw new Error('研究任务尚未冻结执行截止时间');
  return (
    Date.parse(execution.deadlineAt) -
    (execution.timing?.policy.cleanupReserveMs ?? AI_TIMEOUT_CLEANUP_RESERVE_MS)
  );
};

export const researchTimeoutPolicy = (execution: AiExecutionSummary) =>
  execution.timing?.policy ??
  createAiTimeoutPolicy('research', execution.frozenPolicy!.maxDurationSeconds * 1_000);
