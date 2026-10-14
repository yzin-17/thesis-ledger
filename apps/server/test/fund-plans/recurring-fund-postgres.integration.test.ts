import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recurringFundInvestmentOccurrenceSchema } from '@thesis-ledger/schemas';
import {
  createFundPostgresFixture,
  fundConfirmation,
  fundDatabaseUrl,
  type FundPostgresFixture,
} from './recurring-fund-postgres.fixture.js';

const isolated = fundDatabaseUrl ? describe : describe.skip;

isolated('基金定投隔离 PostgreSQL HTTP 与 Scheduler 最小闭环', () => {
  let fixture: FundPostgresFixture;
  beforeAll(async () => {
    fixture = await createFundPostgresFixture();
  });
  afterAll(async () => {
    await fixture?.close();
  });

  it('生产固定任务补齐月份，重复调度不重复物化且确认前不写账', async () => {
    const account = await fixture.account();
    const plan = await fixture.createPlan(account.id);
    const job = await fixture.prisma.automationJob.findUniqueOrThrow({
      where: { systemKey: 'fund-investment-materialization' },
    });
    await fixture.prisma.automationJob.update({
      where: { id: job.id },
      data: { enabled: true, nextRunAt: new Date('2026-03-31T01:05:00Z') },
    });
    const now = new Date('2026-03-31T01:05:00Z');
    expect((await fixture.scheduler.runDue(now)).jobs).toEqual([
      { jobId: job.id, status: 'succeeded' },
    ]);
    const occurrences = await fixture.prisma.recurringFundInvestmentOccurrence.findMany({
      where: { planId: plan.id },
      orderBy: { periodKey: 'asc' },
    });
    expect(occurrences.map((row) => [row.periodKey, row.scheduledFor.toISOString()])).toEqual([
      ['2026-01', '2026-01-31T01:00:00.000Z'],
      ['2026-02', '2026-02-28T01:00:00.000Z'],
      ['2026-03', '2026-03-31T01:00:00.000Z'],
    ]);
    expect(occurrences.every((row) => row.status === 'PENDING' && row.ledgerEventId === null)).toBe(
      true,
    );
    expect((await fixture.scheduler.runDue(now)).jobs).toEqual([]);
    await fixture.prisma.automationJob.update({
      where: { id: job.id },
      data: { nextRunAt: new Date('2026-03-31T01:10:00Z') },
    });
    expect((await fixture.scheduler.runDue(new Date('2026-03-31T01:10:00Z'))).jobs[0]?.status).toBe(
      'succeeded',
    );
    expect(
      await fixture.prisma.recurringFundInvestmentOccurrence.count({ where: { planId: plan.id } }),
    ).toBe(3);
    const runs = await fixture.prisma.automationRun.findMany({ where: { jobId: job.id } });
    expect(runs).toHaveLength(2);
    expect(runs.every((run) => run.status === 'succeeded' && run.finishedAt !== null)).toBe(true);
    expect(await fixture.prisma.ledgerEvent.count({ where: { accountId: account.id } })).toBe(0);
    expect(await fixture.prisma.position.count({ where: { accountId: account.id } })).toBe(0);
    expect(await fixture.prisma.cashBalance.count({ where: { accountId: account.id } })).toBe(0);
    await fixture.prisma.automationJob.update({ where: { id: job.id }, data: { enabled: false } });
  });

  it('并发确认及重放只写一个当前买入事实，投影和读取同步可见', async () => {
    const { account, occurrence } = await fixture.pending();
    const path = `fund-investment-occurrences/${occurrence.id}/confirm`;
    const responses = await Promise.all([
      fixture.http(path, fundConfirmation),
      fixture.http(path, fundConfirmation),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const confirmed = recurringFundInvestmentOccurrenceSchema.parse(responses[0]?.body);
    expect(confirmed).toMatchObject({
      status: 'CONFIRMED',
      version: 2,
      actualQuantity: '100',
      unitPrice: '1.25',
      commission: '1',
    });
    expect(recurringFundInvestmentOccurrenceSchema.parse(responses[1]?.body).ledgerEventId).toBe(
      confirmed.ledgerEventId,
    );
    expect((await fixture.http(path, fundConfirmation)).status).toBe(201);
    const stored = await fixture.prisma.ledgerEvent.findMany({ where: { accountId: account.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: confirmed.ledgerEventId,
      factId: confirmed.ledgerFactId,
      type: 'BUY_EXECUTION',
      envelopeVersion: 3,
    });
    const read = await fixture.queries.effectiveEvents(account.id);
    expect(read.events).toHaveLength(1);
    expect(read.events[0]).toMatchObject({
      type: 'BUY_EXECUTION',
      eventId: confirmed.ledgerEventId,
    });
    expect(
      (
        await fixture.prisma.position.findFirstOrThrow({ where: { accountId: account.id } })
      ).quantity.toString(),
    ).toBe('100');
    expect(
      (
        await fixture.prisma.cashBalance.findFirstOrThrow({ where: { accountId: account.id } })
      ).settledAmount.toString(),
    ).toBe('-126');
    expect(
      await fixture.prisma.accountLedgerState.findUniqueOrThrow({
        where: { accountId: account.id },
      }),
    ).toMatchObject({ ledgerRevision: 1n, projectionGeneration: 1n });
  });

  it('确认等待账户锁时跳过获胜，确认冲突回滚全部账本和投影', async () => {
    const { account, occurrence } = await fixture.pending();
    await fixture.prisma.accountLedgerState.create({ data: { accountId: account.id } });
    let release = () => {};
    let acquired = () => {};
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lock = fixture.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT "accountId" FROM "AccountLedgerState" WHERE "accountId"=${account.id}::uuid FOR UPDATE`;
        acquired();
        await held;
      },
      { timeout: 10_000 },
    );
    await ready;
    const confirmation = fixture.http(
      `fund-investment-occurrences/${occurrence.id}/confirm`,
      fundConfirmation,
    );
    try {
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const rows = await fixture.prisma.$queryRaw<Array<{ blocked: boolean }>>`
          SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
            AND pid<>pg_backend_pid() AND cardinality(pg_blocking_pids(pid))>0) AS blocked
        `;
        if (rows[0]?.blocked) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      expect(
        (
          await fixture.http(`fund-investment-occurrences/${occurrence.id}/skip`, {
            expectedVersion: 1,
            reason: '并发跳过验收',
          })
        ).status,
      ).toBe(201);
    } finally {
      release();
      await lock;
    }
    expect(await confirmation).toMatchObject({
      status: 409,
      body: { errorCode: 'FUND_INVESTMENT_PLAN_VERSION_CONFLICT' },
    });
    const stored = await fixture.prisma.recurringFundInvestmentOccurrence.findUniqueOrThrow({
      where: { id: occurrence.id },
    });
    expect(stored).toMatchObject({
      status: 'SKIPPED',
      ledgerEventId: null,
      ledgerFactId: null,
      actualQuantity: null,
    });
    expect(await fixture.prisma.ledgerEvent.count({ where: { accountId: account.id } })).toBe(0);
    expect(await fixture.prisma.position.count({ where: { accountId: account.id } })).toBe(0);
    expect(await fixture.prisma.cashBalance.count({ where: { accountId: account.id } })).toBe(0);
    expect(
      await fixture.prisma.accountLedgerState.findUniqueOrThrow({
        where: { accountId: account.id },
      }),
    ).toMatchObject({ ledgerRevision: 0n, projectionGeneration: 0n });
  });
});
