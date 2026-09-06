import { describe, expect, it, vi } from 'vitest';
import { PerformanceService } from '../src/performance/performance.service.js';

type Snapshot = {
  id: string;
  accountId: string;
  capturedAt: Date;
  marketValue: number;
  costValue: number;
  cashValue: number;
  payload: Record<string, unknown>;
};

type ExternalEvent = {
  type: string;
  accountId: string;
  occurredAt: Date;
  createdAt: Date;
  payload: {
    direction: 'INFLOW' | 'OUTFLOW';
    category: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
    amount: string;
    currency: string;
  };
};

const snapshot = (
  date: string,
  marketValue: number,
  cashValue = 0,
  payload: Record<string, unknown> = { mode: 'actual', partial: false },
): Snapshot => ({
  id: `snapshot-${date}`,
  accountId: 'a',
  capturedAt: new Date(date),
  marketValue,
  costValue: marketValue,
  cashValue,
  payload,
});

const event = (type: string, amount: number, date = '2025-01-01T12:00:00Z'): ExternalEvent => {
  const cashFlowType = ['CASH_DEPOSIT', 'CASH_WITHDRAW', 'TRANSFER_IN', 'TRANSFER_OUT'].includes(
    type,
  );
  const outflow = type === 'CASH_WITHDRAW' || type === 'TRANSFER_OUT';
  let category: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' = 'DEPOSIT';
  if (type === 'TRANSFER_IN' || type === 'TRANSFER_OUT') category = 'TRANSFER';
  else if (outflow) category = 'WITHDRAWAL';
  return {
    type: cashFlowType ? 'CASH_FLOW' : type,
    accountId: 'a',
    occurredAt: new Date(date),
    createdAt: new Date(date),
    payload: {
      direction: outflow ? 'OUTFLOW' : 'INFLOW',
      category,
      amount: String(amount),
      currency: 'CNY',
    },
  };
};

const summaryService = (snapshots: Snapshot[], events: ExternalEvent[] = []) => {
  const prisma = {
    portfolioSnapshot: {
      findMany: vi.fn(async () => snapshots),
    },
    ledgerEvent: {
      findMany: vi.fn(async () => events),
    },
  };
  return {
    service: new PerformanceService(prisma as never, {} as never),
    prisma,
  };
};

describe('Performance correctness regressions', () => {
  it('persists partial valuation as known market value instead of pretending missing quotes are zero', async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
    const prisma = {
      position: {
        findMany: vi.fn(async () => [
          {
            accountId: 'a',
            symbol: '600519.SH',
            quantity: 100,
            costPrice: 10,
            asset: { assetType: 'stock' },
          },
          {
            accountId: 'a',
            symbol: '000001.SZ',
            quantity: 100,
            costPrice: 8,
            asset: { assetType: 'stock' },
          },
        ]),
      },
      ledgerEvent: { findMany: vi.fn(async () => []) },
      portfolioSnapshot: {
        findMany: vi.fn(async () => []),
        create,
      },
    };
    const market = {
      getQuote: vi.fn(async (symbol: string) => {
        if (symbol === '000001.SZ') throw new Error('quote unavailable');
        return { price: 12, provider: 'dsa', stale: false, freshness: 'live' };
      }),
    };

    const result = await new PerformanceService(prisma as never, market as never).capture(
      'a',
      new Date('2025-01-02T00:00:00Z'),
    );

    expect(result).toMatchObject({ marketValue: 1200 });
    expect(result.payload).toMatchObject({
      knownMarketValue: 1200,
      totalMarketValue: null,
      partial: true,
      missingSymbols: ['000001.SZ'],
      dataQuality: { partial: true, missingSymbols: ['000001.SZ'] },
    });
  });

  it('rejects performance calculation when the selected range contains a partial snapshot', async () => {
    const { service } = summaryService([
      snapshot('2025-01-01T00:00:00Z', 100),
      snapshot('2025-01-02T00:00:00Z', 50, 0, {
        mode: 'actual',
        knownMarketValue: 50,
        totalMarketValue: null,
        partial: true,
        missingSymbols: ['000001.SZ'],
      }),
      snapshot('2025-01-03T00:00:00Z', 110),
    ]);

    await expect(service.summary('a')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PARTIAL_PORTFOLIO_SNAPSHOT',
        missingSymbols: ['000001.SZ'],
      }),
    });
  });

  it.each([
    ['CASH_DEPOSIT', 100, 200],
    ['CASH_WITHDRAW', 40, 60],
    ['TRANSFER_IN', 50, 150],
    ['TRANSFER_OUT', 25, 75],
  ])(
    'treats %s as an external flow instead of investment return',
    async (type, amount, endValue) => {
      const { service } = summaryService(
        [snapshot('2025-01-01T00:00:00Z', 100), snapshot('2025-01-02T00:00:00Z', endValue)],
        [event(type, amount)],
      );

      await expect(service.summary('a')).resolves.toMatchObject({ ttwror: 0 });
    },
  );

  it('does not treat security trades as portfolio external flows', async () => {
    const { service } = summaryService(
      [snapshot('2025-01-01T00:00:00Z', 100), snapshot('2025-01-02T00:00:00Z', 110)],
      [event('BUY', 50)],
    );

    const result = await service.summary('a');
    expect(result.ttwror).toBeCloseTo(0.1);
  });

  it('builds XIRR from starting capital and terminal portfolio value instead of daily cash balances', async () => {
    const { service } = summaryService([
      snapshot('2024-01-01T00:00:00Z', 100, 900),
      snapshot('2025-01-01T00:00:00Z', 1100, 0),
    ]);

    const result = await service.summary('a');
    expect(result.xirr).toBeCloseTo(0.1, 3);
    expect(result.xirrReason).toBeNull();
  });

  it('uses multiple contributions and withdrawals as investor cash flows', async () => {
    const { service } = summaryService(
      [snapshot('2024-01-01T00:00:00Z', 1000), snapshot('2025-01-01T00:00:00Z', 1300)],
      [
        event('CASH_DEPOSIT', 500, '2024-07-01T00:00:00Z'),
        event('CASH_WITHDRAW', 200, '2024-10-01T00:00:00Z'),
      ],
    );

    const result = await service.summary('a');
    expect(result.ttwror).toBeCloseTo(0);
    expect(result.xirr).toBeCloseTo(0, 6);
    expect(result.xirrReason).toBeNull();
  });

  it('keeps an explainable reason when XIRR has no valid cash-flow solution', async () => {
    const { service } = summaryService([
      snapshot('2024-01-01T00:00:00Z', 0),
      snapshot('2025-01-01T00:00:00Z', 0),
    ]);

    const result = await service.summary('a');
    expect(result.xirr).toBeNull();
    // domain 的 XIRR 报错文案已中文化为「资金加权收益率…」（用户可读术语），断言跟随
    expect(result.xirrReason).toContain('资金加权收益率');
  });
});
