import { Prisma, type AiRun } from '@prisma/client';
import { aiExecutionSummarySchema } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import { researchExecutionDeadline, startResearchClock } from './timeout/ai-execution-clock.js';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};

/** 领取、首次时钟与租约在同一行锁事务内提交；恢复只继承已冻结时间。 */
export const claimAiRun = (prisma: PrismaService, id: string, leaseMs: number) =>
  prisma.$transaction(async (transaction) => {
    const [run] = await transaction.$queryRaw<AiRun[]>(Prisma.sql`
      SELECT * FROM "AiRun" WHERE "id"=${id}::uuid FOR UPDATE
    `);
    if (!run || run.status !== 'queued') return null;
    const now = new Date();
    const metadata = record(run.modelMetadata);
    const parsed = aiExecutionSummarySchema.safeParse(metadata.sdkExecution);
    const research = parsed.success && parsed.data.contract.id === 'research';
    let nextMetadata: Prisma.InputJsonValue | undefined;
    if (research) {
      const queueExpired =
        parsed.data.timing?.taskDeadlineAt === null &&
        Date.parse(parsed.data.timing.queueExpiresAt) <= now.getTime();
      let errorCode = queueExpired ? 'research_queue_expired' : 'research_task_budget_exhausted';
      let errorSummary = queueExpired
        ? '研究排队等待已过期，未启动执行或发送请求'
        : '研究执行预算已耗尽，未发送 Provider 请求';
      let execution = null;
      try {
        if (
          !parsed.data.timing &&
          typeof record(record(metadata.sdkExecution).frozenPolicy).maxDurationSeconds !== 'number'
        )
          throw new Error('历史任务缺少可证明的原执行预算，拒绝重新授予默认预算');
        execution = startResearchClock({
          execution: parsed.data,
          firstStartedAt: run.startedAt,
          executionAttempt: run.executionAttempt,
          now: now.getTime(),
        });
      } catch (error) {
        errorCode = 'research_policy_missing';
        errorSummary = error instanceof Error ? error.message : '研究执行时钟无效';
      }
      if (!execution || researchExecutionDeadline(execution) <= now.getTime()) {
        await transaction.aiRun.updateMany({
          where: { id, status: 'queued', executionAttempt: run.executionAttempt },
          data: {
            status: 'failed',
            errorCode,
            errorSummary,
            completedAt: now,
            claimedAt: null,
            leaseUntil: null,
            modelMetadata: {
              ...metadata,
              sdkExecution: {
                ...parsed.data,
                generationStatus: 'incomplete',
                continuationBlockedReason: 'expired',
              },
            },
          },
        });
        return null;
      }
      nextMetadata = { ...metadata, sdkExecution: execution };
    }
    const result = await transaction.aiRun.updateMany({
      where: { id, status: 'queued', executionAttempt: run.executionAttempt },
      data: {
        status: 'running',
        startedAt: run.startedAt ?? now,
        claimedAt: now,
        leaseUntil: new Date(now.getTime() + leaseMs),
        executionAttempt: { increment: 1 },
        errorCode: null,
        errorSummary: null,
        completedAt: null,
        ...(nextMetadata === undefined ? {} : { modelMetadata: nextMetadata }),
      },
    });
    if (result.count !== 1) return null;
    return transaction.aiRun.findUnique({ where: { id } });
  });
