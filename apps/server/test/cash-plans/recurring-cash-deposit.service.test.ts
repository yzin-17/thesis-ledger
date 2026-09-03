import { describe, expect, it, vi } from 'vitest';
import { RecurringCashDepositService } from '../../src/cash-plans/recurring-cash-deposit.service.js';

const cashAccountId = '11111111-1111-4111-8111-111111111111';
const securitiesAccountId = '22222222-2222-4222-8222-222222222222';

type PlanRow = {
  id: string;
  accountId: string;
  name: string;
  expectedAmount: string;
  currency: string;
  dayOfMonth: number;
  timezone: 'Asia/Shanghai';
  startPeriod: string;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
  nextDueAt: Date | null;
  version: number;
  pausedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type OccurrenceRow = {
  id: string;
  planId: string;
  accountId: string;
  periodKey: string;
  planName: string;
  scheduledFor: Date;
  expectedAmount: string;
  currency: string;
  status: 'PENDING' | 'CONFIRMED' | 'SKIPPED';
  actualAmount: string | null;
  occurredAt: Date | null;
  ledgerEventId: string | null;
  ledgerFactId: string | null;
  version: number;
  skippedReason: string | null;
  confirmedAt: Date | null;
  skippedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type FixturePrisma = {
  account: unknown;
  recurringCashDepositPlan: unknown;
  recurringCashDepositOccurrence: unknown;
  $transaction: (operation: (transaction: FixturePrisma) => Promise<unknown>) => Promise<unknown>;
};

const createFixture = () => {
  const now = new Date('2026-08-30T00:00:00.000Z');
  const accounts = new Map([
    [
      cashAccountId,
      { id: cashAccountId, active: true, mode: 'actual', type: 'cash', currency: 'CNY' },
    ],
    [
      securitiesAccountId,
      {
        id: securitiesAccountId,
        active: true,
        mode: 'actual',
        type: 'securities',
        currency: 'CNY',
      },
    ],
  ]);
  const plans = new Map<string, PlanRow>();
  const occurrences = new Map<string, OccurrenceRow>();
  let planSequence = 0;
  let occurrenceSequence = 0;

  const prisma: FixturePrisma = {
    account: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => accounts.get(where.id)),
    },
    recurringCashDepositPlan: {
      create: vi.fn(async ({ data }: { data: Omit<PlanRow, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const id = `plan-${++planSequence}`;
        const row = {
          ...data,
          status: data.status ?? 'ACTIVE',
          nextDueAt: data.nextDueAt ?? null,
          version: data.version ?? 1,
          pausedAt: data.pausedAt ?? null,
          endedAt: data.endedAt ?? null,
          id,
          createdAt: now,
          updatedAt: now,
        } as PlanRow;
        plans.set(id, row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        [...plans.values()].filter((plan) => {
          if (where.accountId && plan.accountId !== where.accountId) return false;
          if (where.status && plan.status !== where.status) return false;
          if (
            where.nextDueAt &&
            plan.nextDueAt &&
            plan.nextDueAt > (where.nextDueAt as { lte: Date }).lte
          )
            return false;
          return true;
        }),
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => plans.get(where.id) ?? null,
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; version?: number; status?: string };
          data: Record<string, unknown>;
        }) => {
          const row = plans.get(where.id);
          if (!row || (where.version !== undefined && row.version !== where.version))
            return { count: 0 };
          if (where.status !== undefined && row.status !== where.status) return { count: 0 };
          if (typeof data.status === 'string') row.status = data.status as PlanRow['status'];
          if (data.nextDueAt !== undefined) row.nextDueAt = data.nextDueAt as Date | null;
          if (data.pausedAt !== undefined) row.pausedAt = data.pausedAt as Date | null;
          if (data.endedAt !== undefined) row.endedAt = data.endedAt as Date | null;
          if (typeof data.name === 'string') row.name = data.name;
          if (typeof data.expectedAmount === 'string') row.expectedAmount = data.expectedAmount;
          if (typeof data.dayOfMonth === 'number') row.dayOfMonth = data.dayOfMonth;
          if (data.version && typeof data.version === 'object' && 'increment' in data.version)
            row.version += Number((data.version as { increment: number }).increment);
          row.updatedAt = now;
          return { count: 1 };
        },
      ),
    },
    recurringCashDepositOccurrence: {
      createMany: vi.fn(
        async ({
          data,
        }: {
          data: Array<Omit<OccurrenceRow, 'id' | 'createdAt' | 'updatedAt'>>;
        }) => {
          for (const input of data) {
            const row = {
              ...input,
              status: input.status ?? 'PENDING',
              actualAmount: input.actualAmount ?? null,
              occurredAt: input.occurredAt ?? null,
              ledgerEventId: input.ledgerEventId ?? null,
              ledgerFactId: input.ledgerFactId ?? null,
              version: input.version ?? 1,
              skippedReason: input.skippedReason ?? null,
              confirmedAt: input.confirmedAt ?? null,
              skippedAt: input.skippedAt ?? null,
              id: `occurrence-${++occurrenceSequence}`,
              createdAt: now,
              updatedAt: now,
            } as OccurrenceRow;
            occurrences.set(row.id, row);
          }
          return { count: data.length };
        },
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        [...occurrences.values()].filter((occurrence) => {
          if (where.planId && occurrence.planId !== where.planId) return false;
          if (where.accountId && occurrence.accountId !== where.accountId) return false;
          if (where.status && occurrence.status !== where.status) return false;
          if (where.periodKey && typeof where.periodKey === 'object' && 'in' in where.periodKey)
            return (where.periodKey as { in: string[] }).in.includes(occurrence.periodKey);
          return true;
        }),
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => occurrences.get(where.id) ?? null,
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; status?: string; version?: number };
          data: Record<string, unknown>;
        }) => {
          const row = occurrences.get(where.id);
          if (
            !row ||
            (where.status !== undefined && row.status !== where.status) ||
            (where.version !== undefined && row.version !== where.version)
          )
            return { count: 0 };
          for (const [key, value] of Object.entries(data)) {
            if (key === 'version' && typeof value === 'object' && value && 'increment' in value)
              row.version += Number((value as { increment: number }).increment);
            else if (key in row) (row as unknown as Record<string, unknown>)[key] = value;
          }
          row.updatedAt = now;
          return { count: 1 };
        },
      ),
    },
    $transaction: vi.fn((operation: (transaction: FixturePrisma) => Promise<unknown>) =>
      operation(prisma),
    ),
  };

  const cashCommands = {
    createCashFlowWithEffect: vi.fn(
      async (
        command: unknown,
        effect: (
          transaction: typeof prisma,
          event: { eventId: string; factId: string },
        ) => Promise<void>,
      ) => {
        await effect(prisma, { eventId: 'ledger-event-1', factId: 'ledger-fact-1' });
        return { response: { idempotentReplay: false }, command };
      },
    ),
  };
  const notifications = {
    enqueue: vi.fn(async () => []),
  };
  return {
    now,
    plans,
    occurrences,
    prisma,
    cashCommands,
    notifications,
    service: new RecurringCashDepositService(
      prisma as never,
      cashCommands as never,
      notifications as never,
    ),
  };
};

const createPlanInput = (accountId = cashAccountId) => ({
  accountId,
  name: '工资入账',
  expectedAmount: '1000.00',
  dayOfMonth: 31,
  startPeriod: '2026-07',
});

describe('定期现金入账计划', () => {
  it('只允许启用的真实现金账户创建计划', async () => {
    const fixture = createFixture();
    await expect(fixture.service.create(createPlanInput())).resolves.toMatchObject({
      accountId: cashAccountId,
      currency: 'CNY',
      status: 'ACTIVE',
      version: 1,
    });
    await expect(fixture.service.create(createPlanInput(securitiesAccountId))).rejects.toThrow(
      '真实现金账户',
    );
  });

  it('到期只生成待确认实例，补齐历史月份且按计划月份去重', async () => {
    const fixture = createFixture();
    const plan = await fixture.service.create(createPlanInput());

    await expect(
      fixture.service.materializeDue(new Date('2026-08-31T02:00:00.000Z')),
    ).resolves.toMatchObject({ planCount: 1, results: [{ createdCount: 2 }] });
    expect([...fixture.occurrences.values()].map((row) => row.periodKey)).toEqual([
      '2026-07',
      '2026-08',
    ]);
    expect(fixture.plans.get(plan.id)?.version).toBe(2);
    expect(fixture.notifications.enqueue).toHaveBeenCalledTimes(1);
    expect(fixture.notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'recurring-cash-deposit-plan',
        id: plan.id,
        dedupKey: `recurring-cash-deposit:${plan.id}:2026-07,2026-08`,
      }),
      expect.objectContaining({
        title: '工资入账 · 待确认入账',
        body: expect.stringContaining('已补齐 2 期'),
        severity: 'info',
      }),
      expect.objectContaining({ cooldownMinutes: 1, maxAttempts: 3 }),
      new Date('2026-08-31T02:00:00.000Z'),
    );
    await fixture.service.materializeDue(new Date('2026-08-31T03:00:00.000Z'));
    expect(fixture.occurrences.size).toBe(2);
    expect(fixture.notifications.enqueue).toHaveBeenCalledTimes(1);
  });

  it('通知排队失败不回滚已生成实例', async () => {
    const fixture = createFixture();
    await fixture.service.create(createPlanInput());
    fixture.notifications.enqueue.mockRejectedValueOnce(new Error('outbox unavailable'));

    await expect(
      fixture.service.materializeDue(new Date('2026-07-31T02:00:00.000Z')),
    ).resolves.toMatchObject({
      planCount: 1,
      results: [{ createdCount: 1, notificationQueued: false }],
    });
    expect(fixture.occurrences.size).toBe(1);
  });

  it('确认实例与现金 Ledger 写入共享事务 seam，并支持幂等确认', async () => {
    const fixture = createFixture();
    await fixture.service.create(createPlanInput());
    await fixture.service.materializeDue(new Date('2026-07-31T02:00:00.000Z'));
    const occurrence = [...fixture.occurrences.values()][0]!;

    const confirmed = await fixture.service.confirmOccurrence(occurrence.id, {
      expectedVersion: occurrence.version,
      actualAmount: '980.50',
      occurredAt: '2026-07-31T01:30:00.000Z',
    });
    expect(confirmed).toMatchObject({
      status: 'CONFIRMED',
      actualAmount: '980.50',
      ledgerEventId: 'ledger-event-1',
      ledgerFactId: 'ledger-fact-1',
    });
    expect(fixture.cashCommands.createCashFlowWithEffect).toHaveBeenCalledTimes(1);
    expect(fixture.cashCommands.createCashFlowWithEffect.mock.calls[0]?.[0]).toMatchObject({
      payload: {
        direction: 'INFLOW',
        category: 'DEPOSIT',
        amount: '980.50',
        currency: 'CNY',
        settledAt: '2026-07-31T01:30:00.000Z',
      },
    });
    await expect(
      fixture.service.confirmOccurrence(occurrence.id, {
        expectedVersion: 1,
        actualAmount: '1',
        occurredAt: '2026-07-31T01:30:00.000Z',
      }),
    ).resolves.toMatchObject({ status: 'CONFIRMED', actualAmount: '980.50' });
    expect(fixture.cashCommands.createCashFlowWithEffect).toHaveBeenCalledTimes(1);
  });

  it('计划和实例使用版本控制，暂停期间不补期，实例可跳过后恢复', async () => {
    const fixture = createFixture();
    const plan = await fixture.service.create(createPlanInput());
    const updated = await fixture.service.update(plan.id, {
      expectedVersion: 1,
      expectedAmount: '1200',
    });
    expect(updated).toMatchObject({ expectedAmount: '1200', version: 2 });
    await expect(
      fixture.service.update(plan.id, { expectedVersion: 1, expectedAmount: '1300' }),
    ).rejects.toThrow('变化');

    await fixture.service.materializeDue(new Date('2026-07-31T02:00:00.000Z'));
    const occurrence = [...fixture.occurrences.values()][0]!;
    await expect(
      fixture.service.skipOccurrence(occurrence.id, { expectedVersion: 1, reason: '本月未到账' }),
    ).resolves.toMatchObject({ status: 'SKIPPED', version: 2 });
    await expect(
      fixture.service.reopenOccurrence(occurrence.id, { expectedVersion: 2 }),
    ).resolves.toMatchObject({ status: 'PENDING', version: 3 });

    await expect(fixture.service.pause(plan.id, { expectedVersion: 3 })).resolves.toMatchObject({
      status: 'PAUSED',
      nextDueAt: null,
      version: 4,
    });
    await expect(
      fixture.service.resume(plan.id, { expectedVersion: 4 }, new Date('2026-09-15T00:00:00.000Z')),
    ).resolves.toMatchObject({ status: 'ACTIVE', version: 5 });
    await fixture.service.materializeDue(new Date('2026-09-30T02:00:00.000Z'));
    expect([...fixture.occurrences.values()].map((row) => row.periodKey)).toEqual([
      '2026-07',
      '2026-09',
    ]);
    await expect(fixture.service.end(plan.id, { expectedVersion: 6 })).resolves.toMatchObject({
      status: 'ENDED',
      nextDueAt: null,
      version: 7,
    });
  });
});
