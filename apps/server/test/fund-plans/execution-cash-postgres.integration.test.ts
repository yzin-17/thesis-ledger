import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFundPostgresFixture,
  fundDatabaseUrl,
  type FundPostgresFixture,
} from './recurring-fund-postgres.fixture.js';
const isolated = fundDatabaseUrl ? describe : describe.skip;
isolated('成交现金准入隔离 PostgreSQL', () => {
  let fixture: FundPostgresFixture;
  beforeAll(async () => {
    fixture = await createFundPostgresFixture();
  });
  afterAll(async () => {
    await fixture?.close();
  });
  it('定投本金加费用不足返回稳定码且待确认、账本和投影不变，补足后可用同一实例确认', async () => {
    const { account, occurrence } = await fixture.pending();
    await fixture.fund(account.id, '100');
    const before = await fixture.prisma.accountLedgerState.findUniqueOrThrow({
      where: { accountId: account.id },
    });
    const body = {
      expectedVersion: 1,
      actualQuantity: '80',
      unitPrice: '1.25',
      commission: '1',
      occurredAt: '2026-01-31',
    };
    const path = `fund-investment-occurrences/${occurrence.id}/confirm`;
    const denied = await fixture.http(path, body);
    expect(denied).toMatchObject({ status: 409, body: { errorCode: 'LEDGER_INSUFFICIENT_CASH' } });
    expect(
      await fixture.prisma.accountLedgerState.findUniqueOrThrow({
        where: { accountId: account.id },
      }),
    ).toEqual(before);
    expect(
      await fixture.prisma.ledgerEvent.count({
        where: { accountId: account.id, type: 'BUY_EXECUTION' },
      }),
    ).toBe(0);
    expect(await fixture.prisma.position.count({ where: { accountId: account.id } })).toBe(0);
    expect(
      await fixture.prisma.recurringFundInvestmentOccurrence.findUniqueOrThrow({
        where: { id: occurrence.id },
      }),
    ).toMatchObject({ status: 'PENDING', version: 1, ledgerEventId: null });
    await fixture.fund(account.id, '1');
    expect((await fixture.http(path, body)).status).toBe(201);
    expect(
      (
        await fixture.prisma.cashBalance.findFirstOrThrow({ where: { accountId: account.id } })
      ).settledAmount.toString(),
    ).toBe('0');
  });
  it('两笔并发支出持有同一账户锁，只有一笔可消费余额', async () => {
    const account = await fixture.account();
    await fixture.fund(account.id, '150');
    const create = (id: string) =>
      fixture.commands.createExecution({
        command: 'CREATE_EXECUTION',
        accountId: account.id,
        occurredAt: '2026-01-31',
        timePrecision: 'DATE',
        sourceTimezone: 'Asia/Shanghai',
        economicOrderKey: id,
        side: 'BUY',
        payload: {
          symbol: '000001.OF',
          quantity: '80',
          price: '1.25',
          currency: 'CNY',
          capabilityVerification: 'UNVERIFIED',
          charges: [],
        },
        source: { category: 'MANUAL', channel: 'isolated-cash-admission', externalId: id },
        actorId: 'fixture-owner',
      });
    const results = await Promise.allSettled([create('buy-a'), create('buy-b')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.getResponse()).toMatchObject({ errorCode: 'LEDGER_INSUFFICIENT_CASH' });
    expect(
      await fixture.prisma.ledgerEvent.count({
        where: { accountId: account.id, type: 'BUY_EXECUTION' },
      }),
    ).toBe(1);
    expect(
      (
        await fixture.prisma.cashBalance.findFirstOrThrow({ where: { accountId: account.id } })
      ).settledAmount.toString(),
    ).toBe('50');
    expect(
      await fixture.prisma.accountLedgerState.findUniqueOrThrow({
        where: { accountId: account.id },
      }),
    ).toMatchObject({ ledgerRevision: 2n, projectionGeneration: 2n });
  });
});
