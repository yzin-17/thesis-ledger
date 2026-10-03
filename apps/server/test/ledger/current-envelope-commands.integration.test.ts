import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerCommandService } from '../../src/ledger/ledger-command.service.js';
import { CashLedgerCommandService } from '../../src/ledger/cash-ledger-command.service.js';
import { LedgerV2Repository } from '../../src/ledger/ledger-v2.repository.js';
import { rebuildCoreProjections } from '../../src/ledger/core-projection.js';
import { ImportRollbackService } from '../../src/imports/import-rollback.service.js';

const databaseUrl = process.env.LEDGER_CURRENT_TEST_DATABASE_URL;
const isolated = databaseUrl ? describe : describe.skip;
const occurredAt = '2026-09-29T02:00:00.000Z';
const settledAt = '2026-09-30T02:00:00.000Z';
const symbol = '600519.SH';
const source = (externalId: string) => ({ category: 'MANUAL', channel: 'e03-b', externalId });
const execution = (accountId: string, externalId: string) => ({
  command: 'CREATE_EXECUTION',
  accountId,
  occurredAt,
  timePrecision: 'INSTANT',
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: externalId,
  actorId: 'e03-b',
  source: source(externalId),
  side: 'BUY',
  payload: {
    symbol,
    quantity: '10',
    price: '10',
    currency: 'CNY',
    capabilityVerification: 'VERIFIED',
    settledAt,
    charges: [{ category: 'COMMISSION', amount: '2', currency: 'CNY' }],
  },
});

isolated('隔离 PostgreSQL 当前命令与投影', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
  const repository = new LedgerV2Repository(prisma as never);
  const commands = new LedgerCommandService(repository);
  const cash = new CashLedgerCommandService(repository);
  const account = () => prisma.account.create({ data: { name: 'E03-b 夹具', type: 'securities' } });
  const snapshot = async (accountId: string) => ({
    events: await prisma.ledgerEvent.findMany({ where: { accountId }, orderBy: { id: 'asc' } }),
    state: await prisma.accountLedgerState.findUnique({ where: { accountId } }),
    positions: await prisma.position.findMany({ where: { accountId } }),
    trades: await prisma.trade.findMany({
      where: { accountId },
      include: {
        entryLegs: true,
        baselineComponents: true,
        corporateActions: true,
        closeSlices: { include: { allocations: true } },
        dividendAttributions: true,
        evidenceSources: true,
      },
    }),
    balances: await prisma.cashBalance.findMany({ where: { accountId } }),
    settlements: await prisma.cashSettlement.findMany({ where: { accountId } }),
  });
  const rebuildAt = (accountId: string, now: string) =>
    prisma.$transaction((tx) =>
      rebuildCoreProjections(tx, accountId, { method: 'AVG', now: new Date(now) }),
    );

  beforeAll(async () => {
    const url = new URL(databaseUrl ?? '');
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/ledger_current_fixture')
      throw new Error('仅允许 E03-b 独立本机数据库');
    const identity = await prisma.$queryRaw<
      Array<{ name: string }>
    >`SELECT current_database() AS name`;
    expect(identity[0]?.name).toBe('ledger_current_fixture');
    await prisma.asset.upsert({
      where: { symbol },
      update: {},
      create: {
        symbol,
        name: '经济夹具',
        market: 'CN',
        assetType: 'stock',
        currency: 'CNY',
        identityStatus: 'confirmed',
      },
    });
  });
  afterAll(() => prisma.$disconnect());

  it('创建、修订、撤销和恢复只改变有效事实，持久化当前信封', async () => {
    const { id } = await account();
    const command = execution(id, 'create');
    const created = await commands.createExecution(command);
    const replaced = await commands.replaceExecution({
      ...command,
      command: 'REPLACE_EXECUTION',
      expectedLedgerRevision: '1',
      supersedesEventId: created.eventIds[0],
      reason: '修正数量',
      source: source('replace'),
      payload: { ...command.payload, quantity: '20' },
    });
    expect(
      (await prisma.position.findFirstOrThrow({ where: { accountId: id } })).quantity.toString(),
    ).toBe('20');
    const voided = await commands.voidExecution({
      command: 'VOID_EXECUTION',
      accountId: id,
      expectedLedgerRevision: '2',
      supersedesEventId: replaced.eventIds[0],
      reason: '撤销',
      source: source('void'),
      actorId: 'e03-b',
    });
    expect(await prisma.position.count({ where: { accountId: id } })).toBe(0);
    expect(await prisma.cashBalance.count({ where: { accountId: id } })).toBe(0);
    const restored = await commands.restoreExecution({
      ...command,
      command: 'RESTORE_EXECUTION',
      expectedLedgerRevision: '3',
      supersedesEventId: voided.eventIds[0],
      reason: '恢复',
      source: source('restore'),
    });
    expect(restored.factIds).toEqual(created.factIds);
    const state = await snapshot(id);
    expect(state.events.map((event) => event.envelopeVersion)).toEqual([3, 3, 3, 3]);
    expect(state.events.every((event) => event.payloadVersion === 1)).toBe(true);
    expect(state.state).toMatchObject({ ledgerRevision: 4n, projectionGeneration: 4n });
    expect(state.positions[0]?.quantity.toString()).toBe('10');
    expect(state.trades).toHaveLength(1);
    expect(state.trades[0]?.projectionGeneration).toBe(4n);
  });

  it('经济 golden：现金、费用、税费、剩余成本与 T+1 结算保持一致', async () => {
    const { id } = await account();
    await cash.createCashFlow({
      command: 'CREATE_CASH_FLOW',
      accountId: id,
      occurredAt,
      timePrecision: 'INSTANT',
      sourceTimezone: 'Asia/Shanghai',
      economicOrderKey: 'a0',
      source: source('deposit'),
      actorId: 'e03-b',
      payload: { direction: 'INFLOW', category: 'DEPOSIT', amount: '1000', currency: 'CNY' },
    });
    await commands.createExecution(execution(id, 'a1'));
    await commands.createExecution({
      ...execution(id, 'a2'),
      side: 'SELL',
      payload: {
        ...execution(id, 'a2').payload,
        quantity: '4',
        price: '15',
        charges: [
          { category: 'COMMISSION', amount: '1', currency: 'CNY' },
          { category: 'TAX', amount: '3', currency: 'CNY' },
        ],
      },
    });
    await rebuildAt(id, occurredAt);
    const before = await snapshot(id);
    expect(before.positions[0]?.quantity.toString()).toBe('6');
    expect(before.positions[0]?.costPrice.toString()).toBe('10');
    expect(before.trades[0]?.grossRealizedPnl?.toString()).toBe('20');
    expect(before.trades[0]?.netRealizedPnl?.toString()).toBe('15.2');
    expect(before.balances[0]?.settledAmount.toString()).toBe('1000');
    expect(before.balances[0]?.pendingPayable.toString()).toBe('102');
    expect(before.balances[0]?.pendingReceivable.toString()).toBe('56');
    expect(before.settlements.filter((row) => row.status === 'PENDING')).toHaveLength(2);
    await rebuildAt(id, settledAt);
    const after = await snapshot(id);
    expect(after.balances[0]?.settledAmount.toString()).toBe('954');
    expect(after.balances[0]?.pendingPayable.toString()).toBe('0');
    expect(after.balances[0]?.pendingReceivable.toString()).toBe('0');
    expect(after.settlements.every((row) => row.status === 'SETTLED')).toBe(true);
    expect(after.state).toEqual(before.state);
  });

  it('同账户并发幂等创建只写一条，竞争修订只允许一个链末', async () => {
    const { id } = await account();
    const command = execution(id, 'concurrent-create');
    const responses = await Promise.all([
      commands.createExecution(command),
      commands.createExecution(command),
    ]);
    expect(responses.map((result) => result.idempotentReplay).sort()).toEqual([false, true]);
    expect(await prisma.ledgerEvent.count({ where: { accountId: id } })).toBe(1);
    const corrections = await Promise.allSettled(
      ['left', 'right'].map((externalId) =>
        commands.replaceExecution({
          ...command,
          command: 'REPLACE_EXECUTION',
          expectedLedgerRevision: '1',
          supersedesEventId: responses[0]!.eventIds[0],
          reason: '竞争修订',
          source: source(externalId),
          payload: { ...command.payload, quantity: '12' },
        }),
      ),
    );
    expect(corrections.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = corrections.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: { response: { errorCode: 'LEDGER_CORRECTION_NOT_CHAIN_TIP' } },
    });
    expect(await prisma.ledgerEvent.count({ where: { accountId: id } })).toBe(2);
    expect((await snapshot(id)).state).toMatchObject({
      ledgerRevision: 2n,
      projectionGeneration: 2n,
    });
  });

  it('份额调整与分红沿用当前信封，分红不混入价差收益', async () => {
    const { id } = await account();
    await commands.createExecution(execution(id, 'a1'));
    const adjustments = [
      { type: 'SPLIT', payload: { symbol, fromUnits: '1', toUnits: '2' } },
      { type: 'MERGE', payload: { symbol, fromUnits: '2', toUnits: '1' } },
      { type: 'BONUS_SHARE', payload: { symbol, quantity: '2' } },
      { type: 'DIVIDEND', payload: { symbol, amount: '5', currency: 'CNY' } },
    ];
    for (const [index, adjustment] of adjustments.entries()) {
      await repository.withAccountWrite(id, async (context) => {
        await repository.appendRevision(context, {
          version: 3,
          eventId: randomUUID(),
          factId: randomUUID(),
          accountId: id,
          ledgerRevision: context.nextLedgerRevision.toString(),
          occurredAt,
          timePrecision: 'INSTANT',
          sourceTimezone: 'Asia/Shanghai',
          economicOrderKey: `a${index + 2}`,
          recordedAt: occurredAt,
          payloadVersion: 1,
          source: source(`adjustment-${index}`),
          actorId: 'e03-b',
          revisionAction: 'CREATE',
          ...adjustment,
        });
        await rebuildCoreProjections(context.transaction, id, {
          method: 'AVG',
          projectionGeneration: context.nextProjectionGeneration,
          now: new Date(settledAt),
        });
        return { value: null, advanceRevision: true };
      });
    }
    const state = await snapshot(id);
    expect(state.positions[0]?.quantity.toString()).toBe('12');
    expect(state.trades[0]?.grossRealizedPnl?.toString()).toBe('0');
    expect(state.trades[0]?.netRealizedPnl?.toString()).toBe('0');
    const tradeId = state.trades[0]!.id;
    expect(await prisma.tradeCorporateActionAdjustment.count({ where: { tradeId } })).toBe(3);
    const dividend = await prisma.tradeDividendAttribution.findFirstOrThrow({ where: { tradeId } });
    expect(dividend.amount.toString()).toBe('5');
    expect(state.balances[0]?.settledAmount.toString()).toBe('-97');
    expect(state.events.every((event) => event.envelopeVersion === 3)).toBe(true);
  });

  it('投影写入失败使新增事件、物化表和账户版本全部回滚', async () => {
    const { id } = await account();
    await commands.createExecution(execution(id, 'before-failure'));
    const before = await snapshot(id);
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION public.e03_b_reject_cash() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."accountId" = '${id}'::uuid THEN RAISE EXCEPTION 'E03-b projection failure'; END IF; RETURN NEW; END $$`,
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER e03_b_reject_cash BEFORE INSERT ON "CashBalance" FOR EACH ROW EXECUTE FUNCTION public.e03_b_reject_cash()',
    );
    try {
      await expect(commands.createExecution(execution(id, 'failed-create'))).rejects.toThrow(
        'E03-b projection failure',
      );
      expect(await snapshot(id)).toEqual(before);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER e03_b_reject_cash ON "CashBalance"');
      await prisma.$executeRawUnsafe('DROP FUNCTION public.e03_b_reject_cash()');
    }
  });

  it('Import 回滚通过当前命令事实追加 VOID 并同步投影', async () => {
    const { id } = await account();
    const draftId = randomUUID();
    const command = execution(id, `draft:${draftId}:1:row-1`);
    await commands.createExecution({
      ...command,
      source: {
        category: 'IMPORT',
        channel: 'screenshot',
        externalId: command.source.externalId,
        sourceRowId: 'row-1',
      },
    });
    await prisma.importDraft.create({
      data: {
        id: draftId,
        accountId: id,
        source: 'test',
        status: 'committed',
        idempotencyKey: draftId,
        imageHash: draftId,
        rows: [{ symbol }],
        committedAt: new Date(),
      },
    });
    await new ImportRollbackService(prisma as never, repository).rollback(draftId);
    expect(await repository.readEffectiveEvents(id)).toEqual([]);
    expect(await prisma.position.count({ where: { accountId: id } })).toBe(0);
    expect(await prisma.trade.count({ where: { accountId: id } })).toBe(0);
    expect(await prisma.cashBalance.count({ where: { accountId: id } })).toBe(0);
    expect(await prisma.importDraft.findUnique({ where: { id: draftId } })).toMatchObject({
      status: 'cancelled',
    });
    const events = await prisma.ledgerEvent.findMany({
      where: { accountId: id },
      orderBy: { ledgerRevision: 'asc' },
    });
    expect(events[1]).toMatchObject({
      envelopeVersion: 3,
      revisionAction: 'VOID',
      sourceRowId: 'row-1',
      supersedesEventId: events[0]?.id,
    });
  });

  it('账户旧行阻断创建、修订、撤销及 Import 回滚且不改变原状态', async () => {
    const { id } = await account();
    const oldEvent = await prisma.ledgerEvent.create({
      data: {
        accountId: id,
        type: 'CASH_FLOW',
        envelopeVersion: null,
        payloadVersion: 1,
        payload: { amount: '100' },
        occurredAt: new Date(occurredAt),
      },
    });
    const draft = await prisma.importDraft.create({
      data: {
        accountId: id,
        source: 'old',
        status: 'committed',
        idempotencyKey: randomUUID(),
        imageHash: 'old',
        rows: [],
      },
    });
    const before = await snapshot(id);
    const command = execution(id, 'old-reject');
    const operations = [
      () => commands.createExecution(command),
      () =>
        commands.replaceExecution({
          ...command,
          command: 'REPLACE_EXECUTION',
          expectedLedgerRevision: '0',
          supersedesEventId: oldEvent.id,
          reason: '旧修订',
        }),
      () =>
        commands.voidExecution({
          command: 'VOID_EXECUTION',
          accountId: id,
          expectedLedgerRevision: '0',
          supersedesEventId: oldEvent.id,
          reason: '旧撤销',
          actorId: 'e03-b',
          source: source('void-old'),
        }),
      () => new ImportRollbackService(prisma as never, repository).rollback(draft.id),
    ];
    for (const operation of operations)
      await expect(operation()).rejects.toMatchObject({
        response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
      });
    expect(await snapshot(id)).toEqual(before);
    expect(await prisma.importDraft.findUnique({ where: { id: draft.id } })).toMatchObject({
      status: 'committed',
    });
  });
});
