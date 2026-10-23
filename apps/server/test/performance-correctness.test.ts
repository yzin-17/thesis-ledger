import { describe, expect, it, vi } from 'vitest';
import { PerformanceService } from '../src/performance/performance.service.js';
import { PerformanceAnalysisService } from '../src/performance/performance-analysis.service.js';

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
  it('真实计算服务区分精确10%与缺边界不可用，XIRR仍独立返回', () => {
    const service = new PerformanceService({} as never, {} as never);
    const cashFlows = [{ date: '2025-01-01', amount: -100 }, { date: '2026-01-01', amount: 110 }];
    expect(service.calculate({ valuations: [{ date: '2025-01-01', value: 100 },
      { date: '2025-01-03', value: 220, externalFlow: 100 }], cashFlows })).toMatchObject({
      ttwror: null, ttwrorReason: expect.stringContaining('边界'), xirr: expect.any(Number),
    });
    const result = service.calculate({ valuations: [{ date: '2025-01-01', value: 100 },
      { date: '2025-01-02', value: 200, externalFlow: 100, flowBoundary: { before: 100, after: 200 } },
      { date: '2025-01-03', value: 220 }], cashFlows });
    expect(result.ttwror).toBeCloseTo(0.1, 12);
    expect(result.ttwrorReason).toBeNull();
  });

  it('实际计算消费者返回严重亏损解，根歧义不会成为可用收益', () => {
    const service = new PerformanceService({} as never, {} as never);
    const result = service.calculate({ valuations: [{ date: '2025-01-01', value: 100 },
      { date: '2026-01-01', value: 10 }], cashFlows: [{ date: '2025-01-01', amount: -100 },
      { date: '2026-01-01', amount: 10 }] });
    expect(result.xirr).not.toBeNull();
    expect(Math.abs(-100 + 10 / (1 + result.xirr!) ** (365 / 365.25))).toBeLessThan(1e-7);
    expect(result.xirrReason).toBeNull();
  });

  it('实际配置消费者保留现金来源，partial 仍隐藏比例并暂停建议', () => {
    const service = new PerformanceService({} as never, {} as never);
    const input = { positions: [{ category: 'stock', marketValue: 500 }, { category: 'cash', marketValue: 500 }], targets: { stock: 1 } };
    expect(service.allocate(input).rebalance).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'stock', amountGap: 500 }),
      expect.objectContaining({ category: 'cash', amountGap: -500 }),
    ]));
    const partial = service.allocate({ ...input, dataQuality: { partial: true, missingSymbols: ['TEST'] } });
    expect(partial.rebalance).toEqual([]);
    expect(partial.allocation.every((row) => row.weight === null)).toBe(true);
    expect(partial.allocation.map((row) => row.value)).toEqual([500, 500]);
  });

  it('零净额的真实现金流不伪装成无流量区间', async () => {
    const { service } = summaryService([
      snapshot('2025-01-01T00:00:00Z', 100), snapshot('2025-01-02T00:00:00Z', 110),
    ], [event('CASH_DEPOSIT', 100), event('CASH_WITHDRAW', 100)]);
    expect(await service.summary('a')).toMatchObject({ ttwror: null, ttwrorReason: expect.stringContaining('边界') });
  });

  it('组合内有明确对手账户的划转不计外部流量，范围外划转仍保留', async () => {
    const rows = [snapshot('2025-01-01T00:00:00Z', 100), snapshot('2025-01-02T00:00:00Z', 110)]
      .map((row) => ({ ...row, accountId: null, currency: 'CNY' }));
    const flow = event('TRANSFER_OUT', 10);
    const transfer = { ...flow, payload: { ...flow.payload,
      transfer: { transferId: 'transfer', leg: 'OUTFLOW', counterpartyAccountId: 'b' } } };
    const data = { accountCurrencies: async () => new Map([['a', 'CNY'], ['b', 'CNY']]),
      resolveFx: async () => ({ meta: { enabled: false, status: 'not_needed', missingCurrencies: [], rates: [] }, rates: new Map() }) };
    const analysis = new PerformanceAnalysisService({ ledgerEvent: { findMany: async () => [transfer] } } as never,
      data as never, { history: async () => rows } as never);
    expect((await analysis.summary()).ttwror).toBeCloseTo(0.1);
    transfer.payload.transfer.counterpartyAccountId = 'outside';
    expect(await analysis.summary()).toMatchObject({ ttwror: null, ttwrorReason: expect.stringContaining('边界') });
  });
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
        findUnique: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
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

      await expect(service.summary('a')).resolves.toMatchObject({ ttwror: null,
        ttwrorReason: expect.stringContaining('边界') });
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
    expect(result.ttwror).toBeNull();
    expect(result.ttwrorReason).toContain('边界');
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
