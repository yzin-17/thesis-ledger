import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AutomationExecutionStore } from '../../src/automation/automation-execution-store.js';
import { PrismaService } from '../../src/platform/prisma.service.js';

const postgresDescribe =
  process.env.RUN_AUTOMATION_POSTGRES_E2E === '1' ? describe : describe.skip;

postgresDescribe('Automation durable occurrence PostgreSQL E2E', () => {
  const prisma = new PrismaService();
  const store = new AutomationExecutionStore(prisma);
  const jobId = randomUUID();
  const scheduledAt = new Date('2026-09-12T06:00:00.000Z');
  const nextRunAt = new Date('2026-09-12T07:00:00.000Z');
  let runId = '';
  let pendingRunId = '';

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.automationJob.create({
      data: {
        id: jobId,
        name: `Automation PostgreSQL E2E ${jobId}`,
        type: 'provider-health',
        cron: '0 * * * *',
        timezone: 'Asia/Shanghai',
        enabled: true,
        retryPolicy: { maxAttempts: 1, backoffMs: 1 },
        lockTtlMs: 1_000,
        nextRunAt: scheduledAt,
      },
    });
  });

  afterAll(async () => {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "AutomationRunLease" WHERE "jobId"=${jobId}::uuid
    `);
    await prisma.automationRun.deleteMany({ where: { jobId } });
    await prisma.automationJob.deleteMany({ where: { id: jobId } });
    await prisma.$disconnect();
  });

  it('并发登记同一 scheduled occurrence 只产生一个 canonical run', async () => {
    const input = {
      jobId,
      scheduledAt,
      nextRunAt,
      recoveryPolicy: 'replay-safe' as const,
    };
    const [first, second] = await Promise.all([
      store.reserveScheduledOccurrence(input),
      store.reserveScheduledOccurrence(input),
    ]);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (!first || !second) throw new Error('并发 occurrence 登记意外被拒绝');
    runId = first.runId;

    expect(second.runId).toBe(first.runId);
    await expect(prisma.automationRun.count({ where: { jobId } })).resolves.toBe(1);
    const leases = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "AutomationRunLease"
      WHERE "jobId"=${jobId}::uuid AND "scheduledAt"=${scheduledAt}
    `);
    expect(Number(leases[0]?.count ?? 0)).toBe(1);
  });

  it('lease recovery 单调增加 ownerAttempt 且拒绝旧 owner 提交', async () => {
    const owner1 = await store.claim(runId, 1_000, scheduledAt);
    expect(owner1).toBe(1);

    const pending = await store.recoverAndListQueued(new Date(scheduledAt.getTime() + 2_000));
    expect(pending).toEqual([
      expect.objectContaining({ runId, jobId, trigger: 'scheduled' }),
    ]);

    const owner2 = await store.claim(runId, 1_000, new Date(scheduledAt.getTime() + 2_000));
    expect(owner2).toBe(2);
    await expect(store.complete(runId, owner1!, { stale: true }, 1)).resolves.toBe(false);
    await expect(store.complete(runId, owner2!, { ok: true }, 1)).resolves.toBe(true);

    const run = await prisma.automationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe('succeeded');
    expect(run.output).toEqual({ ok: true });
    const leases = await prisma.$queryRaw<Array<{ executionAttempt: number; leaseUntil: Date | null }>>(
      Prisma.sql`
        SELECT "executionAttempt", "leaseUntil"
        FROM "AutomationRunLease"
        WHERE "runId"=${runId}::uuid
      `,
    );
    expect(leases[0]).toMatchObject({ executionAttempt: 2, leaseUntil: null });
  });

  it('schedule 已被编辑后拒绝旧 occurrence 落库', async () => {
    const editedNextRunAt = new Date('2026-09-12T08:00:00.000Z');
    await prisma.automationJob.update({
      where: { id: jobId },
      data: { nextRunAt: editedNextRunAt },
    });
    const before = await prisma.automationRun.count({ where: { jobId } });

    const stale = await store.reserveScheduledOccurrence({
      jobId,
      scheduledAt: nextRunAt,
      nextRunAt: editedNextRunAt,
      recoveryPolicy: 'replay-safe',
    });

    expect(stale).toBeNull();
    await expect(prisma.automationRun.count({ where: { jobId } })).resolves.toBe(before);
    const current = await prisma.automationJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(current.nextRunAt).toEqual(editedNextRunAt);
  });

  it('已有 queued occurrence 时合并后续 cron tick，不堆积 backlog', async () => {
    const occurrenceAt = new Date('2026-09-12T08:00:00.000Z');
    const followingAt = new Date('2026-09-12T09:00:00.000Z');
    const afterFollowingAt = new Date('2026-09-12T10:00:00.000Z');
    const first = await store.reserveScheduledOccurrence({
      jobId,
      scheduledAt: occurrenceAt,
      nextRunAt: followingAt,
      recoveryPolicy: 'replay-safe',
    });
    expect(first).not.toBeNull();
    if (!first) throw new Error('scheduled occurrence 登记意外被拒绝');
    pendingRunId = first.runId;
    const beforeSecondTick = await prisma.automationRun.count({ where: { jobId } });

    const coalesced = await store.reserveScheduledOccurrence({
      jobId,
      scheduledAt: followingAt,
      nextRunAt: afterFollowingAt,
      recoveryPolicy: 'replay-safe',
    });

    expect(coalesced).toBeNull();
    await expect(prisma.automationRun.count({ where: { jobId } })).resolves.toBe(beforeSecondTick);
    const current = await prisma.automationJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(current.nextRunAt).toEqual(afterFollowingAt);
  });

  it('occurrence 已登记后停用任务时拒绝 scheduled claim', async () => {
    await prisma.automationJob.update({ where: { id: jobId }, data: { enabled: false } });

    await expect(store.claim(pendingRunId, 1_000, new Date('2026-09-12T08:00:00.000Z'))).resolves.toBeNull();
    const queued = await prisma.automationRun.findUniqueOrThrow({ where: { id: pendingRunId } });
    expect(queued.status).toBe('queued');
  });

  it('manual run 创建即 claim，租约丢失后不进入 scheduler replay', async () => {
    const claimedAt = new Date(scheduledAt.getTime() + 3_000);
    const manual = await store.createClaimedManualRun(jobId, 1_000, claimedAt);
    expect(manual).not.toBeNull();
    if (!manual) throw new Error('manual run 原子 claim 意外被拒绝');

    expect(manual.ownerAttempt).toBe(1);
    const running = await prisma.automationRun.findUniqueOrThrow({ where: { id: manual.runId } });
    expect(running.status).toBe('running');

    const pending = await store.recoverAndListQueued(new Date(claimedAt.getTime() + 2_000));

    expect(pending.some((item) => item.runId === manual.runId)).toBe(false);
    const terminal = await prisma.automationRun.findUniqueOrThrow({ where: { id: manual.runId } });
    expect(terminal.status).toBe('unknown_outcome');
  });
});
