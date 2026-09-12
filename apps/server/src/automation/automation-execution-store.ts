import { Prisma, type PrismaClient } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';

export type AutomationExecutionTrigger = 'manual' | 'scheduled' | 'legacy';
export type AutomationRecoveryPolicy = 'replay-safe' | 'unknown-outcome';

export type PendingAutomationExecution = {
  runId: string;
  jobId: string;
  trigger: AutomationExecutionTrigger;
  scheduledAt: Date | null;
};

type LeaseRow = PendingAutomationExecution & {
  executionAttempt: number;
  leaseUntil: Date | null;
  recoveryPolicy: AutomationRecoveryPolicy;
  status: string;
};

type MemoryLease = LeaseRow & {
  traceId: string;
};

type PrismaLike = PrismaService | PrismaClient;

export const AUTOMATION_MAX_RECOVERY_ATTEMPTS = 3;
const RECONCILE_LIMIT = 100;

export class AutomationExecutionStore {
  private readonly memoryLeases = new Map<string, MemoryLease>();
  private readonly memoryOccurrences = new Map<string, string>();
  private readonly memoryMode: boolean;

  constructor(private readonly prisma: PrismaLike) {
    this.memoryMode = typeof (prisma as { $queryRaw?: unknown }).$queryRaw !== 'function';
  }

  async reserveScheduledOccurrence(input: {
    jobId: string;
    scheduledAt: Date;
    nextRunAt: Date;
    recoveryPolicy: AutomationRecoveryPolicy;
  }) {
    if (this.memoryMode) return this.reserveScheduledOccurrenceInMemory(input);
    const occurrenceKey = `${input.jobId}:${input.scheduledAt.toISOString()}`;
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${occurrenceKey}))`,
      );
      const existing = await transaction.$queryRaw<Array<{ runId: string; traceId: string }>>(
        Prisma.sql`
          SELECT l."runId", r."traceId"
          FROM "AutomationRunLease" l
          JOIN "AutomationRun" r ON r."id"=l."runId"
          WHERE l."jobId"=${input.jobId}::uuid
            AND l."trigger"='scheduled'
            AND l."scheduledAt"=${input.scheduledAt}
          LIMIT 1
        `,
      );
      if (existing[0]) return existing[0];

      // occurrence 尚未登记时，先用持久化 schedule 做 CAS。用户若已修改 cron/timezone、
      // 停用任务或其他 scheduler 已推进 nextRunAt，本次旧调度不能再创建 run。
      const advanced = await transaction.automationJob.updateMany({
        where: {
          id: input.jobId,
          enabled: true,
          nextRunAt: input.scheduledAt,
        },
        data: { nextRunAt: input.nextRunAt },
      });
      if (advanced.count !== 1) return null;

      const created = await transaction.automationRun.create({
        data: {
          jobId: input.jobId,
          status: 'queued',
          traceId: crypto.randomUUID(),
        },
        select: { id: true, traceId: true },
      });
      await transaction.$executeRaw(
        Prisma.sql`
          INSERT INTO "AutomationRunLease" (
            "runId", "jobId", "trigger", "scheduledAt", "recoveryPolicy"
          ) VALUES (
            ${created.id}::uuid, ${input.jobId}::uuid, 'scheduled', ${input.scheduledAt},
            ${input.recoveryPolicy}
          )
        `,
      );
      return { runId: created.id, traceId: created.traceId };
    });
  }

  async advanceSkippedOccurrence(jobId: string, scheduledAt: Date, nextRunAt: Date) {
    if (this.memoryMode) {
      await this.prisma.automationJob.update({ where: { id: jobId }, data: { nextRunAt } });
      return;
    }
    await this.prisma.automationJob.updateMany({
      where: { id: jobId, enabled: true, nextRunAt: scheduledAt },
      data: { nextRunAt },
    });
  }

  async createClaimedManualRun(jobId: string, leaseMs: number, now = new Date()) {
    if (this.memoryMode) {
      const run = await this.createManualRunInMemory(jobId);
      const ownerAttempt = await this.claimInMemory(run.runId, leaseMs, now);
      if (ownerAttempt === null) throw new Error('手动 Automation run 创建后无法 claim');
      return { ...run, ownerAttempt };
    }
    return this.prisma.$transaction(async (transaction) => {
      const run = await transaction.automationRun.create({
        data: { jobId, status: 'running', traceId: crypto.randomUUID() },
        select: { id: true, traceId: true },
      });
      const ownerAttempt = 1;
      await transaction.$executeRaw(
        Prisma.sql`
          INSERT INTO "AutomationRunLease" (
            "runId", "jobId", "trigger", "executionAttempt", "claimedAt", "leaseUntil",
            "recoveryPolicy"
          ) VALUES (
            ${run.id}::uuid, ${jobId}::uuid, 'manual', ${ownerAttempt}, ${now},
            ${new Date(now.getTime() + leaseMs)}, 'unknown-outcome'
          )
        `,
      );
      return { runId: run.id, traceId: run.traceId, ownerAttempt };
    });
  }

  async claim(runId: string, leaseMs: number, now = new Date()) {
    if (this.memoryMode) return this.claimInMemory(runId, leaseMs, now);
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<LeaseRow & { jobEnabled: boolean }>>(
        Prisma.sql`
          SELECT l."runId", l."jobId", l."trigger", l."scheduledAt", l."executionAttempt",
                 l."leaseUntil", l."recoveryPolicy", r."status", j."enabled" AS "jobEnabled"
          FROM "AutomationRunLease" l
          JOIN "AutomationRun" r ON r."id"=l."runId"
          JOIN "AutomationJob" j ON j."id"=l."jobId"
          WHERE l."runId"=${runId}::uuid
          FOR UPDATE OF l, r, j
        `,
      );
      const row = rows[0];
      if (
        !row ||
        row.status !== 'queued' ||
        (row.trigger === 'scheduled' && !row.jobEnabled)
      )
        return null;
      const ownerAttempt = row.executionAttempt + 1;
      const claimed = await transaction.automationRun.updateMany({
        where: { id: runId, status: 'queued' },
        data: { status: 'running', finishedAt: null, error: null },
      });
      if (claimed.count !== 1) return null;
      await transaction.$executeRaw(
        Prisma.sql`
          UPDATE "AutomationRunLease"
          SET "executionAttempt"=${ownerAttempt}, "claimedAt"=${now},
              "leaseUntil"=${new Date(now.getTime() + leaseMs)}, "recoveryReason"=NULL,
              "updatedAt"=CURRENT_TIMESTAMP
          WHERE "runId"=${runId}::uuid
        `,
      );
      return ownerAttempt;
    });
  }

  async setHandlerAttempt(runId: string, ownerAttempt: number, attempt: number) {
    if (this.memoryMode) {
      const lease = this.memoryLeases.get(runId);
      if (!lease || lease.executionAttempt !== ownerAttempt || lease.status !== 'running') return false;
      await this.prisma.automationRun.update({ where: { id: runId }, data: { attempt } });
      return true;
    }
    const changed = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "AutomationRun" r
      SET "attempt"=${attempt}
      WHERE r."id"=${runId}::uuid AND r."status"='running'
        AND EXISTS (
          SELECT 1 FROM "AutomationRunLease" l
          WHERE l."runId"=r."id" AND l."executionAttempt"=${ownerAttempt}
        )
    `);
    return changed === 1;
  }

  async renewLease(runId: string, ownerAttempt: number, leaseMs: number, now = new Date()) {
    if (this.memoryMode) {
      const lease = this.memoryLeases.get(runId);
      if (!lease || lease.executionAttempt !== ownerAttempt || lease.status !== 'running') return false;
      lease.leaseUntil = new Date(now.getTime() + leaseMs);
      return true;
    }
    const changed = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "AutomationRunLease" l
      SET "leaseUntil"=${new Date(now.getTime() + leaseMs)}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE l."runId"=${runId}::uuid AND l."executionAttempt"=${ownerAttempt}
        AND EXISTS (
          SELECT 1 FROM "AutomationRun" r WHERE r."id"=l."runId" AND r."status"='running'
        )
    `);
    return changed === 1;
  }

  async complete(
    runId: string,
    ownerAttempt: number,
    output: unknown,
    handlerAttempts: number,
    finishedAt = new Date(),
  ) {
    return this.finish(runId, ownerAttempt, {
      status: 'succeeded',
      finishedAt,
      attempt: handlerAttempts,
      ...(output === undefined ? {} : { output: output as Prisma.InputJsonValue }),
      error: null,
    });
  }

  async fail(runId: string, ownerAttempt: number, error: unknown, finishedAt = new Date()) {
    return this.finish(runId, ownerAttempt, {
      status: 'failed',
      finishedAt,
      error: error instanceof Error ? error.message : '未知错误',
    });
  }

  async recoverAndListQueued(now = new Date()): Promise<PendingAutomationExecution[]> {
    if (this.memoryMode) return this.recoverAndListQueuedInMemory(now);
    const stale = await this.prisma.$queryRaw<LeaseRow[]>(Prisma.sql`
      SELECT l."runId", l."jobId", l."trigger", l."scheduledAt", l."executionAttempt",
             l."leaseUntil", l."recoveryPolicy", r."status"
      FROM "AutomationRunLease" l
      JOIN "AutomationRun" r ON r."id"=l."runId"
      WHERE r."status"='running' AND l."leaseUntil" IS NOT NULL AND l."leaseUntil" < ${now}
      ORDER BY l."leaseUntil" ASC, l."runId" ASC
      LIMIT ${RECONCILE_LIMIT}
    `);
    for (const row of stale) await this.recoverOne(row.runId, now);
    return this.prisma.$queryRaw<PendingAutomationExecution[]>(Prisma.sql`
      SELECT l."runId", l."jobId", l."trigger", l."scheduledAt"
      FROM "AutomationRunLease" l
      JOIN "AutomationRun" r ON r."id"=l."runId"
      JOIN "AutomationJob" j ON j."id"=l."jobId"
      WHERE r."status"='queued' AND l."trigger"='scheduled' AND j."enabled"=TRUE
      ORDER BY r."startedAt" ASC, r."id" ASC
      LIMIT ${RECONCILE_LIMIT}
    `);
  }

  private async finish(
    runId: string,
    ownerAttempt: number,
    data: Prisma.AutomationRunUpdateManyMutationInput,
  ) {
    if (this.memoryMode) {
      const lease = this.memoryLeases.get(runId);
      if (!lease || lease.executionAttempt !== ownerAttempt || lease.status !== 'running') return false;
      if (typeof data.status === 'string') lease.status = data.status;
      lease.leaseUntil = null;
      await this.prisma.automationRun.update({ where: { id: runId }, data });
      return true;
    }
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ executionAttempt: number; status: string }>>(
        Prisma.sql`
          SELECT l."executionAttempt", r."status"
          FROM "AutomationRunLease" l
          JOIN "AutomationRun" r ON r."id"=l."runId"
          WHERE l."runId"=${runId}::uuid
          FOR UPDATE OF l, r
        `,
      );
      const row = rows[0];
      if (!row || row.status !== 'running' || row.executionAttempt !== ownerAttempt) return false;
      const updated = await transaction.automationRun.updateMany({
        where: { id: runId, status: 'running' },
        data,
      });
      if (updated.count !== 1) return false;
      await transaction.$executeRaw(
        Prisma.sql`
          UPDATE "AutomationRunLease"
          SET "leaseUntil"=NULL, "updatedAt"=CURRENT_TIMESTAMP
          WHERE "runId"=${runId}::uuid AND "executionAttempt"=${ownerAttempt}
        `,
      );
      return true;
    });
  }

  private async recoverOne(runId: string, now: Date) {
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<LeaseRow[]>(Prisma.sql`
        SELECT l."runId", l."jobId", l."trigger", l."scheduledAt", l."executionAttempt",
               l."leaseUntil", l."recoveryPolicy", r."status"
        FROM "AutomationRunLease" l
        JOIN "AutomationRun" r ON r."id"=l."runId"
        WHERE l."runId"=${runId}::uuid
        FOR UPDATE OF l, r
      `);
      const row = rows[0];
      if (!row || row.status !== 'running' || !row.leaseUntil || row.leaseUntil >= now) return;
      const replay = row.recoveryPolicy === 'replay-safe';
      const canRetry = replay && row.executionAttempt < AUTOMATION_MAX_RECOVERY_ATTEMPTS;
      const status = canRetry ? 'queued' : replay ? 'failed' : 'unknown_outcome';
      const reason = canRetry
        ? 'lease_expired_requeue'
        : replay
          ? 'lease_expired_attempts_exhausted'
          : 'lease_expired_unknown_outcome';
      const message = canRetry
        ? '自动化 Worker 租约过期，等待安全重放。'
        : replay
          ? '自动化 Worker 多次丢失租约，已停止自动重放。'
          : '自动化 Worker 租约过期，无法确认外部副作用是否已经完成。';
      await transaction.automationRun.updateMany({
        where: { id: runId, status: 'running' },
        data: {
          status,
          error: message,
          ...(canRetry ? { finishedAt: null } : { finishedAt: now }),
        },
      });
      await transaction.$executeRaw(
        Prisma.sql`
          UPDATE "AutomationRunLease"
          SET "leaseUntil"=NULL, "recoveryReason"=${reason}, "updatedAt"=CURRENT_TIMESTAMP
          WHERE "runId"=${runId}::uuid AND "executionAttempt"=${row.executionAttempt}
        `,
      );
    });
  }

  private async reserveScheduledOccurrenceInMemory(input: {
    jobId: string;
    scheduledAt: Date;
    nextRunAt: Date;
    recoveryPolicy: AutomationRecoveryPolicy;
  }) {
    const key = `${input.jobId}:${input.scheduledAt.toISOString()}`;
    const existingId = this.memoryOccurrences.get(key);
    if (existingId) {
      const existing = this.memoryLeases.get(existingId)!;
      return { runId: existing.runId, traceId: existing.traceId };
    }
    const created = await this.prisma.automationRun.create({
      data: { jobId: input.jobId, status: 'queued', traceId: crypto.randomUUID() },
    });
    const runId = String(created.id);
    const traceId = String(created.traceId ?? crypto.randomUUID());
    this.memoryOccurrences.set(key, runId);
    this.memoryLeases.set(runId, {
      runId,
      jobId: input.jobId,
      trigger: 'scheduled',
      scheduledAt: input.scheduledAt,
      executionAttempt: 0,
      leaseUntil: null,
      recoveryPolicy: input.recoveryPolicy,
      status: 'queued',
      traceId,
    });
    await this.prisma.automationJob.update({
      where: { id: input.jobId },
      data: { nextRunAt: input.nextRunAt },
    });
    return { runId, traceId };
  }

  private async createManualRunInMemory(jobId: string) {
    const created = await this.prisma.automationRun.create({
      data: { jobId, status: 'queued', traceId: crypto.randomUUID() },
    });
    const runId = String(created.id);
    const traceId = String(created.traceId ?? crypto.randomUUID());
    this.memoryLeases.set(runId, {
      runId,
      jobId,
      trigger: 'manual',
      scheduledAt: null,
      executionAttempt: 0,
      leaseUntil: null,
      recoveryPolicy: 'unknown-outcome',
      status: 'queued',
      traceId,
    });
    return { runId, traceId };
  }

  private async claimInMemory(runId: string, leaseMs: number, now: Date) {
    const lease = this.memoryLeases.get(runId);
    if (!lease || lease.status !== 'queued') return null;
    lease.status = 'running';
    lease.executionAttempt += 1;
    lease.leaseUntil = new Date(now.getTime() + leaseMs);
    await this.prisma.automationRun.update({
      where: { id: runId },
      data: { status: 'running', finishedAt: null, error: null },
    });
    return lease.executionAttempt;
  }

  private async recoverAndListQueuedInMemory(now: Date) {
    for (const lease of this.memoryLeases.values()) {
      if (lease.status !== 'running' || !lease.leaseUntil || lease.leaseUntil >= now) continue;
      if (
        lease.recoveryPolicy === 'replay-safe' &&
        lease.executionAttempt < AUTOMATION_MAX_RECOVERY_ATTEMPTS
      ) {
        lease.status = 'queued';
        lease.leaseUntil = null;
        await this.prisma.automationRun.update({
          where: { id: lease.runId },
          data: {
            status: 'queued',
            finishedAt: null,
            error: '自动化 Worker 租约过期，等待安全重放。',
          },
        });
      } else {
        lease.status = lease.recoveryPolicy === 'replay-safe' ? 'failed' : 'unknown_outcome';
        lease.leaseUntil = null;
        await this.prisma.automationRun.update({
          where: { id: lease.runId },
          data: {
            status: lease.status,
            finishedAt: now,
            error:
              lease.status === 'failed'
                ? '自动化 Worker 多次丢失租约，已停止自动重放。'
                : '自动化 Worker 租约过期，无法确认外部副作用是否已经完成。',
          },
        });
      }
    }
    return [...this.memoryLeases.values()]
      .filter((lease) => lease.status === 'queued' && lease.trigger === 'scheduled')
      .map(({ runId, jobId, trigger, scheduledAt }) => ({ runId, jobId, trigger, scheduledAt }));
  }
}
