import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerV2Repository } from '../../src/ledger/ledger-v2.repository.js';

const databaseUrl = process.env.LEDGER_ENVELOPE_TEST_DATABASE_URL;
const isolatedDescribe = databaseUrl ? describe : describe.skip;
const currentAccountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

isolatedDescribe('隔离 PostgreSQL 账本信封版本', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
  const repository = new LedgerV2Repository(prisma as never);

  beforeAll(async () => {
    const target = new URL(databaseUrl ?? '');
    if (target.hostname !== '127.0.0.1' || target.pathname !== '/ledger_envelope_fixture') {
      throw new Error('账本集成测试仅允许独立本机数据库');
    }
    await prisma.$connect();
    await prisma.account.createMany({
      data: [
        { id: currentAccountId, name: '当前信封夹具', type: 'brokerage' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });


  it('当前新事件以信封版本 1 原子写入并可读回', async () => {
    const result = await repository.withAccountWrite(currentAccountId, async (context) => {
      await repository.appendRevision(context, {
        version: 1,
        eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
        factId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
        accountId: currentAccountId,
        ledgerRevision: context.nextLedgerRevision.toString(),
        type: 'CASH_FLOW',
        occurredAt: '2026-09-29T02:00:00.000Z',
        timePrecision: 'INSTANT',
        sourceTimezone: 'Asia/Shanghai',
        economicOrderKey: 'a0',
        recordedAt: '2026-09-29T02:01:00.000Z',
        payloadVersion: 1,
        source: { category: 'MANUAL', channel: 'test', externalId: 'current-envelope' },
        actorId: 'test-user',
        revisionAction: 'CREATE',
        payload: { direction: 'INFLOW', category: 'DEPOSIT', amount: '100', currency: 'CNY' },
      });
      return { value: null, advanceRevision: true };
    });
    expect(result).toMatchObject({ ledgerRevision: '1', projectionGeneration: '1' });
    const stored = await prisma.ledgerEvent.findFirstOrThrow({
      where: { accountId: currentAccountId },
    });
    expect(stored).toMatchObject({ envelopeVersion: 1, payloadVersion: 1, ledgerRevision: 1n });
    const read = await repository.readEffectiveEvents(currentAccountId);
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject({ version: 1, eventId: stored.id, payloadVersion: 1 });
  });
});
