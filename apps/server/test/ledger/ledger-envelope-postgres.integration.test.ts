import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerV2Repository } from '../../src/ledger/ledger-v2.repository.js';

const databaseUrl = process.env.LEDGER_ENVELOPE_TEST_DATABASE_URL;
const isolatedDescribe = databaseUrl ? describe : describe.skip;
const oldAccountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
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
        { id: oldAccountId, name: '旧信封夹具', type: 'brokerage' },
        { id: currentAccountId, name: '当前信封夹具', type: 'brokerage' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('旧空标记在读取和写入锁内拒绝，账户版本不变', async () => {
    await prisma.ledgerEvent.create({
      data: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
        accountId: oldAccountId,
        type: 'CASH_FLOW',
        occurredAt: new Date('2026-09-29T02:00:00.000Z'),
        factId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
        ledgerRevision: 1n,
        timePrecision: 'INSTANT',
        sourceTimezone: 'Asia/Shanghai',
        economicOrderKey: 'a0',
        envelopeVersion: null,
        payloadVersion: 1,
        payload: { direction: 'INFLOW', category: 'DEPOSIT', amount: '100', currency: 'CNY' },
        sourceCategory: 'MANUAL',
        sourceChannel: 'test',
        actorId: 'test-user',
        revisionAction: 'CREATE',
      },
    });
    await expect(repository.readEffectiveEvents(oldAccountId)).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
    });
    let mutationCalled = false;
    await expect(
      repository.withAccountWrite(oldAccountId, async () => {
        mutationCalled = true;
        return { value: null, advanceRevision: true };
      }),
    ).rejects.toMatchObject({ response: { code: 'UNSUPPORTED_CONTRACT_VERSION' } });
    expect(mutationCalled).toBe(false);
    expect(
      await prisma.accountLedgerState.findUnique({ where: { accountId: oldAccountId } }),
    ).toBeNull();
    expect(await prisma.ledgerEvent.count({ where: { accountId: oldAccountId } })).toBe(1);
  });

  it('当前新事件以信封版本 3 原子写入并可读回', async () => {
    const result = await repository.withAccountWrite(currentAccountId, async (context) => {
      await repository.appendRevision(context, {
        version: 3,
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
    expect(stored).toMatchObject({ envelopeVersion: 3, payloadVersion: 1, ledgerRevision: 1n });
    const read = await repository.readEffectiveEvents(currentAccountId);
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject({ version: 3, eventId: stored.id, payloadVersion: 1 });
  });
});
