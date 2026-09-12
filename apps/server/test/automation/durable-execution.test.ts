import { describe, expect, it, vi } from 'vitest';
import {
  AutomationExecutionStore,
  AUTOMATION_MAX_RECOVERY_ATTEMPTS,
} from '../../src/automation/automation-execution-store.js';
import { automationRecoveryPolicy } from '../../src/automation/automation.service.js';

const fixture = () => {
  let sequence = 0;
  const runs = new Map<string, Record<string, unknown>>();
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    sequence += 1;
    const row = { id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`, ...data };
    runs.set(String(row.id), row);
    return row;
  });
  const update = vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const current = runs.get(where.id) ?? { id: where.id };
    const row = { ...current, ...data };
    runs.set(where.id, row);
    return row;
  });
  const prisma = {
    automationRun: { create, update },
    automationJob: { update: vi.fn(async ({ data }: { data: object }) => data) },
  };
  return { store: new AutomationExecutionStore(prisma as never), prisma, runs };
};

const requireReservation = <T>(value: T | null): T => {
  if (!value) throw new Error('scheduled occurrence 登记意外被拒绝');
  return value;
};

describe('Automation durable occurrence / owner', () => {
  it('同一 scheduled occurrence 只登记一个 canonical run', async () => {
    const { store, prisma } = fixture();
    const input = {
      jobId: '00000000-0000-4000-8000-000000000001',
      scheduledAt: new Date('2026-09-12T01:00:00Z'),
      nextRunAt: new Date('2026-09-12T02:00:00Z'),
      recoveryPolicy: 'replay-safe' as const,
    };

    const first = requireReservation(await store.reserveScheduledOccurrence(input));
    const second = requireReservation(await store.reserveScheduledOccurrence(input));

    expect(second.runId).toBe(first.runId);
    expect(prisma.automationRun.create).toHaveBeenCalledTimes(1);
  });

  it('manual run 创建即 claim，崩溃后保守进入 unknown_outcome', async () => {
    const { store, runs } = fixture();
    const run = await store.createClaimedManualRun(
      '00000000-0000-4000-8000-000000000001',
      1_000,
      new Date('2026-09-12T01:00:00Z'),
    );

    expect(run.ownerAttempt).toBe(1);
    expect(runs.get(run.runId)).toMatchObject({ status: 'running' });

    const pending = await store.recoverAndListQueued(new Date('2026-09-12T01:00:02Z'));

    expect(pending).toEqual([]);
    expect(runs.get(run.runId)).toMatchObject({
      status: 'unknown_outcome',
      error: expect.stringContaining('无法确认外部副作用'),
    });
  });

  it('lease 过期后 replay-safe run 生成新 owner，旧 owner 无法提交', async () => {
    const { store, runs } = fixture();
    const reserved = requireReservation(
      await store.reserveScheduledOccurrence({
        jobId: '00000000-0000-4000-8000-000000000001',
        scheduledAt: new Date('2026-09-12T01:00:00Z'),
        nextRunAt: new Date('2026-09-12T02:00:00Z'),
        recoveryPolicy: 'replay-safe',
      }),
    );
    const owner1 = await store.claim(reserved.runId, 1_000, new Date('2026-09-12T01:00:00Z'));
    expect(owner1).toBe(1);

    const pending = await store.recoverAndListQueued(new Date('2026-09-12T01:00:02Z'));
    expect(pending).toEqual([
      expect.objectContaining({ runId: reserved.runId, trigger: 'scheduled' }),
    ]);

    const owner2 = await store.claim(reserved.runId, 1_000, new Date('2026-09-12T01:00:02Z'));
    expect(owner2).toBe(2);
    await expect(store.complete(reserved.runId, 1, { stale: true }, 1)).resolves.toBe(false);
    await expect(store.complete(reserved.runId, 2, { ok: true }, 1)).resolves.toBe(true);
    expect(runs.get(reserved.runId)).toMatchObject({ status: 'succeeded', output: { ok: true } });
  });

  it('replay-safe recovery 有独立于 handler retry 的 owner 上限', async () => {
    const { store, runs } = fixture();
    const reserved = requireReservation(
      await store.reserveScheduledOccurrence({
        jobId: '00000000-0000-4000-8000-000000000001',
        scheduledAt: new Date('2026-09-12T01:00:00Z'),
        nextRunAt: new Date('2026-09-12T02:00:00Z'),
        recoveryPolicy: 'replay-safe',
      }),
    );

    for (let attempt = 1; attempt <= AUTOMATION_MAX_RECOVERY_ATTEMPTS; attempt += 1) {
      expect(
        await store.claim(
          reserved.runId,
          1_000,
          new Date(`2026-09-12T01:00:0${(attempt - 1) * 2}Z`),
        ),
      ).toBe(attempt);
      await store.recoverAndListQueued(new Date(`2026-09-12T01:00:0${attempt * 2}Z`));
    }

    expect(runs.get(reserved.runId)).toMatchObject({ status: 'failed' });
  });

  it('仅明确幂等的 scheduled handler 允许自动 replay', () => {
    expect(automationRecoveryPolicy('market-sync', 'scheduled')).toBe('replay-safe');
    expect(automationRecoveryPolicy('cash-deposit-materialization', 'scheduled')).toBe('replay-safe');
    expect(automationRecoveryPolicy('fund-investment-materialization', 'scheduled')).toBe('replay-safe');
    expect(automationRecoveryPolicy('provider-health', 'scheduled')).toBe('unknown-outcome');
    expect(automationRecoveryPolicy('backup', 'scheduled')).toBe('unknown-outcome');
    expect(automationRecoveryPolicy('snapshot-close-estimate', 'scheduled')).toBe('unknown-outcome');
    expect(automationRecoveryPolicy('provider-health', 'manual')).toBe('unknown-outcome');
  });
});
