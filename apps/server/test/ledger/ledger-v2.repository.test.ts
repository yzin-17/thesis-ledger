import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  LedgerV2Repository,
  type AccountLedgerWriteContext,
} from '../../src/ledger/ledger-v2.repository.js';
import { latestLedgerEventByFact } from '../../src/ledger/ledger-event-v2.js';

const accountId = '11111111-1111-4111-8111-111111111111';

const createTransaction = (
  states: Array<{ ledgerRevision: bigint; projectionGeneration: bigint }>,
) => ({
  $executeRaw: vi.fn(async () => 1),
  $queryRaw: vi.fn(async () => {
    const state = states.shift();
    return state ? [{ accountId, ...state }] : [];
  }),
  accountLedgerState: { update: vi.fn(async ({ data }: { data: object }) => data) },
  ledgerEvent: { create: vi.fn(async ({ data }: { data: object }) => data) },
});

const createRepository = (
  transaction: ReturnType<typeof createTransaction>,
  storedEvents: object[] = [],
) => {
  const prisma = {
    $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    ledgerEvent: { findMany: vi.fn(async () => storedEvents) },
  };
  return { repository: new LedgerV2Repository(prisma as never), prisma };
};

const createEvent = (revision: string, overrides: Record<string, unknown> = {}) => ({
  version: 2,
  eventId: '22222222-2222-4222-8222-222222222222',
  factId: '33333333-3333-4333-8333-333333333333',
  accountId,
  ledgerRevision: revision,
  type: 'BUY_EXECUTION',
  occurredAt: '2026-08-26T02:30:00.000Z',
  timePrecision: 'INSTANT',
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'a0',
  recordedAt: '2026-08-26T02:31:00.000Z',
  payloadVersion: 1,
  source: { category: 'MANUAL', channel: 'desktop', externalId: `command-${revision}` },
  actorId: 'user-1',
  revisionAction: 'CREATE',
  payload: {
    symbol: 'AAPL.US',
    quantity: '1.25',
    price: '205.30',
    currency: 'USD',
    capabilityVerification: 'VERIFIED',
    charges: [],
  },
  ...overrides,
});

describe('Ledger V2 不可变持久化', () => {
  it('按 Ledger Revision 选择修正链末端，而不是依赖查询返回顺序', () => {
    const older = { factId: 'fact-1', ledgerRevision: '3', id: 'event-old' };
    const newer = { factId: 'fact-1', ledgerRevision: '7', id: 'event-new' };

    expect(latestLedgerEventByFact([newer, older]).get('fact-1')).toBe(newer);
  });

  it('同一账户成功写入时单调增加 Ledger Revision 和 Projection Generation', async () => {
    const transaction = createTransaction([
      { ledgerRevision: 0n, projectionGeneration: 4n },
      { ledgerRevision: 1n, projectionGeneration: 5n },
    ]);
    const { repository } = createRepository(transaction);
    const write = (expectedRevision: bigint) =>
      repository.withAccountWrite(accountId, async (context) => {
        expect(context.nextLedgerRevision).toBe(expectedRevision);
        return { value: 'ok', advanceRevision: true };
      });

    await expect(write(1n)).resolves.toMatchObject({
      ledgerRevision: '1',
      projectionGeneration: '5',
    });
    await expect(write(2n)).resolves.toMatchObject({
      ledgerRevision: '2',
      projectionGeneration: '6',
    });
    expect(transaction.accountLedgerState.update).toHaveBeenNthCalledWith(2, {
      where: { accountId },
      data: { ledgerRevision: 2n, projectionGeneration: 6n },
    });
  });

  it('无变更结果不增加账户版本', async () => {
    const transaction = createTransaction([{ ledgerRevision: 9n, projectionGeneration: 7n }]);
    const { repository } = createRepository(transaction);

    await expect(
      repository.withAccountWrite(accountId, async () => ({
        value: 'idempotent replay',
        advanceRevision: false,
      })),
    ).resolves.toEqual({
      value: 'idempotent replay',
      ledgerRevision: '9',
      projectionGeneration: '7',
    });
    expect(transaction.accountLedgerState.update).not.toHaveBeenCalled();
  });

  it('事务内操作失败时不推进版本', async () => {
    const transaction = createTransaction([{ ledgerRevision: 2n, projectionGeneration: 3n }]);
    const { repository } = createRepository(transaction);

    await expect(
      repository.withAccountWrite(accountId, async () => {
        throw new Error('projection failed');
      }),
    ).rejects.toThrow('projection failed');
    expect(transaction.accountLedgerState.update).not.toHaveBeenCalled();
  });

  it('只能在已锁定账户的下一 Revision 追加事件', async () => {
    const transaction = createTransaction([]);
    const { repository } = createRepository(transaction);
    const context = {
      transaction: transaction as never,
      accountId,
      currentLedgerRevision: 4n,
      nextLedgerRevision: 5n,
      currentProjectionGeneration: 8n,
      nextProjectionGeneration: 9n,
    } satisfies AccountLedgerWriteContext;

    await expect(repository.appendRevision(context, createEvent('4'))).rejects.toThrow(
      'Revision 与事务下一版本不一致',
    );
    await expect(repository.appendRevision(context, createEvent('5'))).resolves.toMatchObject({
      ledgerRevision: '5',
    });
    expect(transaction.ledgerEvent.create).toHaveBeenCalledOnce();
  });

  it('按指定 Revision 读取每条事实的有效链末并排除 VOID', async () => {
    const baseStored = {
      id: '22222222-2222-4222-8222-222222222222',
      accountId,
      type: 'BUY_EXECUTION',
      factId: '33333333-3333-4333-8333-333333333333',
      ledgerRevision: 1n,
      occurredAt: new Date('2026-08-26T02:30:00.000Z'),
      timePrecision: 'INSTANT',
      sourceTimezone: 'Asia/Shanghai',
      economicOrderKey: 'a0',
      recordedAt: new Date('2026-08-26T02:31:00.000Z'),
      payloadVersion: 1,
      payload: createEvent('1').payload,
      sourceCategory: 'MANUAL',
      sourceChannel: 'desktop',
      externalId: 'command-1',
      actorId: 'user-1',
      revisionAction: 'CREATE',
      supersedesEventId: null,
      reason: null,
    };
    const voidStored = {
      ...baseStored,
      id: '44444444-4444-4444-8444-444444444444',
      ledgerRevision: 2n,
      payload: null,
      revisionAction: 'VOID',
      supersedesEventId: baseStored.id,
      reason: '重复导入',
    };
    const transaction = createTransaction([]);
    const { repository, prisma } = createRepository(transaction, [baseStored, voidStored]);

    await expect(repository.readEffectiveEvents(accountId, '2')).resolves.toEqual([]);
    expect(prisma.ledgerEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ledgerRevision: { lte: 2n } }),
      }),
    );
  });

  it('写入和读取 sourceRowId，历史事件无来源行时保持可读', async () => {
    const baseStored = {
      id: '55555555-5555-4555-8555-555555555555',
      accountId,
      type: 'BUY_EXECUTION',
      factId: '66666666-6666-4666-8666-666666666666',
      ledgerRevision: 1n,
      occurredAt: new Date('2026-08-26T02:30:00.000Z'),
      timePrecision: 'INSTANT',
      sourceTimezone: 'Asia/Shanghai',
      economicOrderKey: 'a0',
      recordedAt: new Date('2026-08-26T02:31:00.000Z'),
      payloadVersion: 1,
      payload: createEvent('1').payload,
      sourceCategory: 'MIGRATION',
      sourceChannel: 'legacy',
      externalId: 'legacy:event-1',
      sourceRowId: null,
      actorId: 'migration',
      revisionAction: 'CREATE',
      supersedesEventId: null,
      reason: null,
    };
    const importedStored = {
      ...baseStored,
      id: '77777777-7777-4777-8777-777777777777',
      factId: '88888888-8888-4888-8888-888888888888',
      sourceCategory: 'IMPORT',
      sourceChannel: 'broker-pdf',
      externalId: 'draft:import-1:1:row-1',
      sourceRowId: 'row-1',
    };
    const transaction = createTransaction([]);
    const { repository } = createRepository(transaction, [baseStored, importedStored]);
    const context = {
      transaction: transaction as never,
      accountId,
      currentLedgerRevision: 0n,
      nextLedgerRevision: 1n,
      currentProjectionGeneration: 0n,
      nextProjectionGeneration: 1n,
    } satisfies AccountLedgerWriteContext;
    const event = createEvent('1', {
      source: { ...createEvent('1').source, sourceRowId: 'row-2' },
    });

    await repository.appendRevision(context, event);

    expect(transaction.ledgerEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sourceRowId: 'row-2' }),
    });
    const effective = await repository.readEffectiveEvents(accountId);
    expect(effective.find((item) => item.eventId === importedStored.id)?.source.sourceRowId).toBe(
      'row-1',
    );
    expect(effective.find((item) => item.eventId === baseStored.id)?.source).not.toHaveProperty(
      'sourceRowId',
    );
  });

  it('current baseline 通过触发器禁止 LedgerEvent 修改和删除', async () => {
    const sql = await readFile(
      new URL(
        '../../prisma/migrations/20260902000000_fresh_database_baseline/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const repositorySource = await readFile(
      new URL('../../src/ledger/ledger-v2.repository.ts', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "LedgerEvent"');
    expect(repositorySource).toContain('FOR UPDATE');
  });
});
