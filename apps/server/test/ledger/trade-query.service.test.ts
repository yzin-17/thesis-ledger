import { describe, expect, it, vi } from 'vitest';
import { TradeQueryService } from '../../src/ledger/trade-query.service.js';

const accountA = '11111111-1111-4111-8111-111111111111';
const accountB = '22222222-2222-4222-8222-222222222222';
const factOne = '33333333-3333-4333-8333-333333333331';
const factTwo = '33333333-3333-4333-8333-333333333332';

const makeTrade = (input: {
  id: string;
  accountId?: string;
  accountMode?: 'actual' | 'shadow';
  factId?: string;
  openedAt?: string;
}) => {
  const accountId = input.accountId ?? accountA;
  const factId = input.factId ?? factOne;
  return {
    id: input.id,
    accountId,
    accountMode: input.accountMode ?? 'actual',
    symbol: 'AAPL.US',
    lifecycle: 'ACTIVE',
    exitProgress: 'NONE',
    endEvidence: 'UNKNOWN',
    openedAt: new Date(input.openedAt ?? '2026-08-26T02:30:00.000Z'),
    closedAt: null,
    earliestEvidenceAt: new Date('2026-08-26T02:30:00.000Z'),
    sourceQuantity: '10',
    closedQuantity: '0',
    remainingQuantity: '10',
    grossRealizedPnl: null,
    netRealizedPnl: null,
    realizedNetReturnRate: null,
    costEstimated: false,
    completeness: 'COMPLETE',
    issues: [],
    costIssues: [],
    algorithmVersion: 'trade-projection-v1',
    projectionGeneration: 1n,
    entryLegs: [
      {
        id: `${input.id}:entry`,
        eventId: '44444444-4444-4444-8444-444444444441',
        factId,
        occurredAt: new Date('2026-08-26T02:30:00.000Z'),
        currency: 'USD',
        price: '100.00',
        originalQuantity: '10',
        quantity: '10',
        remainingQuantity: '10',
        rawCost: '1000',
        remainingCost: '1000',
        rawCostEstimated: false,
        charges: [],
      },
    ],
    baselineComponents: [],
    corporateActions: [],
    closeSlices: [],
    dividendAttributions: [],
    evidenceSources: [
      {
        id: `${input.id}:evidence`,
        kind: 'EXECUTION',
        eventId: '44444444-4444-4444-8444-444444444441',
        factId,
        source: { category: 'MANUAL', channel: 'test', externalId: 'test-1' },
      },
    ],
  };
};

const createHarness = (initialTrades: unknown[]) => {
  const trades = [...initialTrades] as Array<ReturnType<typeof makeTrade>>;
  const generations = new Map([
    [accountA, '1'],
    [accountB, '1'],
  ]);
  const prisma = {
    account: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        [accountA, accountB].includes(where.id) ? { id: where.id } : null,
      ),
      findMany: vi.fn(async ({ where }: { where: { mode: string } }) =>
        [
          { id: accountA, mode: 'actual' },
          { id: accountB, mode: 'shadow' },
        ].filter((account) => account.mode === where.mode),
      ),
    },
    accountLedgerState: {
      findMany: vi.fn(async ({ where }: { where: { accountId: { in: string[] } } }) =>
        where.accountId.in.map((accountId) => ({
          accountId,
          projectionGeneration: BigInt(generations.get(accountId) ?? '0'),
        })),
      ),
    },
    trade: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        trades.filter(
          (trade) =>
            (where.accountId === undefined || trade.accountId === where.accountId) &&
            trade.accountMode === where.accountMode &&
            (where.symbol === undefined || trade.symbol === where.symbol) &&
            (where.lifecycle === undefined || trade.lifecycle === where.lifecycle),
        ),
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          trades.find((trade) => trade.id === where.id) ?? null,
      ),
    },
  };
  return {
    service: new TradeQueryService(prisma as never),
    trades,
    generations,
  };
};

describe('Trade 查询 API 服务', () => {
  it('按账户和模式隔离，并让游标绑定 Projection Generation', async () => {
    const harness = createHarness([
      makeTrade({ id: 'trade-a', openedAt: '2026-08-27T00:00:00.000Z' }),
      makeTrade({ id: 'trade-b', openedAt: '2026-08-26T00:00:00.000Z' }),
      makeTrade({ id: 'trade-shadow', accountId: accountB, accountMode: 'shadow' }),
    ]);

    const first = await harness.service.list({ accountId: accountA, mode: 'actual', limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.accountId).toBe(accountA);
    expect(first.nextCursor).toEqual(expect.any(String));

    harness.generations.set(accountA, '2');
    await expect(
      harness.service.list({
        accountId: accountA,
        mode: 'actual',
        limit: 1,
        cursor: first.nextCursor!,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ errorCode: 'PROJECTION_GENERATION_CONFLICT' }),
    });

    const shadow = await harness.service.list({ mode: 'shadow' });
    expect(shadow.items).toHaveLength(1);
    expect(shadow.items[0]?.accountMode).toBe('shadow');
  });

  it('详情将所有物化金额转换为十进制字符串，并返回 Close Slice 查询边界', async () => {
    const harness = createHarness([makeTrade({ id: 'trade-detail' })]);

    const detail = await harness.service.get(accountA, 'trade-detail');
    expect(detail).toMatchObject({
      id: 'trade-detail',
      sourceQuantity: '10',
      entryLegs: [{ price: '100.00', rawCost: '1000' }],
    });
    await expect(
      harness.service.closeSlice(accountA, 'trade-detail', 'missing-slice'),
    ).rejects.toThrow('Close Slice 不存在');
  });

  it('旧引用只按保存的全部事实唯一匹配，歧义和无匹配保留旧快照', async () => {
    const unique = createHarness([makeTrade({ id: 'trade-unique', factId: factTwo })]);
    await expect(
      unique.service.resolveReference({ accountId: accountA, factIds: [factTwo] }),
    ).resolves.toMatchObject({ status: 'RESOLVED', trade: { id: 'trade-unique' } });

    const ambiguous = createHarness([
      makeTrade({ id: 'trade-one', factId: factOne }),
      makeTrade({ id: 'trade-two', factId: factOne }),
    ]);
    const ambiguousResult = await ambiguous.service.resolveReference({
      accountId: accountA,
      tradeId: 'old-trade-id',
      factIds: [factOne],
      snapshot: { symbol: 'AAPL.US' },
    });
    expect(ambiguousResult).toMatchObject({
      status: 'AMBIGUOUS',
      candidateTradeIds: ['trade-one', 'trade-two'],
      snapshot: { symbol: 'AAPL.US' },
    });
    expect(ambiguousResult).not.toHaveProperty('trade');

    await expect(
      unique.service.resolveReference({
        accountId: accountA,
        tradeId: 'trade-unique',
        factIds: [factOne],
        snapshot: { legacy: true },
      }),
    ).resolves.toMatchObject({ status: 'LEGACY', snapshot: { legacy: true } });
  });
});
