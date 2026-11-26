import { afterEach, expect, it, vi } from 'vitest';
import {
  arenaSubmitDecision,
  arenaMatchOrders,
  arenaAvailableCash,
  arenaAccountNav,
  arenaEqualWeightBook,
  type ArenaPaperContext,
  type ArenaPaperAccount,
  type ArenaPaperDecision,
  type ArenaPaperQuote,
} from '@thesis-ledger/domain';
import { MarketLiveExecutionReader } from '../../src/market/market-live-execution-reader.js';

const day = '2026-11-23',
  time = '2026-11-23T02:00:00Z';
function setup(market: 'CN' | 'HK' | 'US', assetType: 'STOCK' | 'ETF') {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(time));
  const symbol =
    market === 'CN'
      ? assetType === 'ETF'
        ? '510300.SH'
        : '600036.SH'
      : market === 'HK'
        ? assetType === 'ETF'
          ? '02800.HK'
          : '00700.HK'
        : assetType === 'ETF' ? 'SPY.US' : 'AAPL.US';
  const currency: 'CNY' | 'HKD' | 'USD' = market === 'CN' ? 'CNY' : market === 'HK' ? 'HKD' : 'USD';
  const quote = {
    symbol,
    price: 10,
    marketTime: time,
    fetchedAt: time,
    stale: false,
    freshness: 'live',
    units: { priceCurrency: currency },
    provider: 'futu',
    upstreamSource: 'futu',
    executionFacts: {
      symbol,
      market,
      assetType,
      securityId: 'verified',
      exchange: market === 'HK' ? 'HK_MAINBOARD' : 'US',
      sharesPerLot: market === 'HK' && assetType === 'ETF' ? '500' : '100',
      delisted: false,
      tradingState: 'normal',
      securityStatus: 'NORMAL',
      marketTime: time,
      observedAt: time,
    },
  };
  const service = {
    getQuote: vi.fn().mockResolvedValue(quote),
    getSession: vi.fn().mockResolvedValue({
      state: 'open',
      date: day,
      sessions: [
        { tradingDate: day, startAt: '2026-11-23T01:30:00Z', endAt: '2026-11-23T07:00:00Z' },
      ],
    }),
  };
  const calendars = {
    read: vi.fn(async ({ end }) => ({
      status: 'ready',
      calendar: {
        sessions: [
          { tradingDate: day, startAt: '2026-11-23T01:30:00Z', endAt: '2026-11-23T07:00:00Z' },
          ...(end > day
            ? [
                {
                  tradingDate: '2026-11-24',
                  startAt: '2026-11-24T01:30:00Z',
                  endAt: '2026-11-24T07:00:00Z',
                },
              ]
            : []),
        ],
      },
    })),
  };
  const dsa = {
    get: vi.fn().mockResolvedValue({
      symbol,
      assetType,
      day,
      observedAt: time,
      state: 'normal',
      evidence: {},
    }),
    backtestInstrumentFacts: vi.fn().mockResolvedValue({
      facts: [
        {
          symbol,
          market,
          instrumentType: assetType,
          currency,
          availableAt: time,
          lotSize: '100',
          tickSize: '0.01',
          tradable: false,
          executionRules: { status: 'unavailable' },
        },
      ],
    }),
    post: vi.fn(),
    effectiveControlPolicyV3: vi.fn(),
    marketPublicFeesV3: vi.fn(),
  };
  const status = { readComposition: vi.fn() },
    actions = { read: vi.fn().mockResolvedValue(['coverage_unverified']) };
  const reader = new MarketLiveExecutionReader(
    service as never,
    calendars as never,
    status,
    actions,
    dsa as never,
  );
  const input = {
    symbol,
    market,
    assetType,
    currency,
    simulationPolicy: 'sampled-v1' as const,
    maxQuoteAgeSeconds: 60,
    expiresOn: [],
  };
  return { reader, input, quote, dsa, actions, status, calendars };
}
afterEach(() => vi.useRealTimers());

it('当前状态请求稍后完成时按完成时钟核验，不把正常网络耗时判为未来数据', async () => {
  const s = setup('CN', 'ETF');
  s.dsa.get.mockImplementationOnce(async () => {
    const completed = '2026-11-23T02:00:05Z';
    vi.setSystemTime(new Date(completed));
    return {
      symbol: s.input.symbol,
      assetType: 'ETF',
      day,
      observedAt: completed,
      state: 'normal',
      evidence: {},
    };
  });
  expect(await s.reader.read(s.input)).toMatchObject({
    status: 'available',
    observation: { observedAt: '2026-11-23T02:00:05.000Z' },
  });
});

it.each([
  ['CN', 'STOCK'],
  ['CN', 'ETF'],
  ['HK', 'STOCK'],
  ['HK', 'ETF'],
  ['US', 'ETF'],
    ['US', 'STOCK'],
] as const)(
  '%s %s 通过实际读取器完成提交、后续成交、可卖与卖款再投资闭环',
  async (market, asset) => {
    const s = setup(market, asset);
    const result = await s.reader.read(s.input);
    expect(result.status).toBe('available');
    if (result.status !== 'available') throw new Error(result.reason);
    const q: ArenaPaperQuote = result.observation;
    expect(q.positionAvailableOn).toBe(market === 'CN' ? '2026-11-24' : day);
    expect(q.cashAvailableOn).toBe(day);
    expect(q.upperLimit).toBeUndefined();
    expect(s.status.readComposition).not.toHaveBeenCalled();
    expect(s.dsa.marketPublicFeesV3).not.toHaveBeenCalled();
    let serial = 0;
    const fees = { buyBps: 10, sellBps: 10, minimum: '1', slippageBps: 0 };
    const c: ArenaPaperContext = {
      at: time,
      tradingDate: day,
      quotes: [q],
      fees,
      maxPositionBps: 10000,
      maxActiveSymbols: 20,
      allowedSymbols: new Set([q.symbol]),
      newId: () => String(++serial),
      expiresAt: () => '2026-11-24T07:00:00Z',
    };
    const empty: ArenaPaperAccount = {
      revision: 0,
      cash: '10000',
      positions: [],
      cashSettlements: [],
      orders: [],
      wakeups: [],
      watchedSymbols: [],
      fills: [],
    };
    const d: ArenaPaperDecision = {
      summary: '隔离样本',
      cancelOrderIds: [],
      watchedSymbols: [],
      wakeups: [{ kind: 'fill', symbol: q.symbol }],
      orders: [
        {
          clientId: 'buy',
          symbol: q.symbol,
          side: 'buy',
          kind: 'market',
          quantity: q.lot,
          price: null,
          expiresOn: null,
          exitGroup: null,
        },
      ],
    };
    const booked = arenaSubmitDecision(empty, 0, d, c);
    expect(arenaAvailableCash(booked, day)).toBe(
      market === 'HK' && asset === 'ETF' ? '4995' : '8999',
    );
    const later = '2026-11-23T02:01:00Z';
    const filledContext = {
      ...c,
      at: later,
      quotes: [{ ...q, marketTime: later, observedAt: later }],
    };
    const bought = arenaMatchOrders(booked, filledContext, true);
    expect(bought.fills).toHaveLength(1);
    expect(bought.fills[0]!.fee).toBe(market === 'HK' && asset === 'ETF' ? '5' : '1');
    expect(arenaMatchOrders(bought, filledContext, true)).toEqual(bought);
    d.orders[0] = { ...d.orders[0]!, clientId: 'sell', side: 'sell' };
    if (market === 'CN')
      expect(() => arenaSubmitDecision(bought, bought.revision, d, filledContext)).toThrow(
        'insufficient_position',
      );
    const sellDay = q.positionAvailableOn;
    const sellAt = sellDay + 'T02:02:00Z';
    const sellContext = {
      ...c,
      at: sellAt,
      tradingDate: sellDay,
      quotes: [
        {
          ...q,
          tradingDate: sellDay,
          cashAvailableOn: sellDay,
          marketTime: sellAt,
          observedAt: sellAt,
        },
      ],
    };
    const selling = arenaSubmitDecision(bought, bought.revision, d, sellContext);
    const tickAt = sellDay + 'T02:03:00Z';
    const sold = arenaMatchOrders(
      selling,
      {
        ...sellContext,
        at: tickAt,
        quotes: sellContext.quotes.map((v) => ({ ...v, marketTime: tickAt, observedAt: tickAt })),
      },
      true,
    );
    expect(sold.positions).toEqual([]);
    expect(sold.cashSettlements).toEqual([]);
    expect(arenaAvailableCash(sold, sellDay)).toBe(sold.cash);
    expect(arenaAccountNav(sold, new Map())).toBe(sold.cash);
    d.orders[0] = { ...d.orders[0]!, clientId: 'reinvest', side: 'buy' };
    expect(
      arenaSubmitDecision(sold, sold.revision, d, { ...sellContext, at: tickAt }).orders.at(-1)!
        .state,
    ).toBe('active');
    const benchmark = arenaEqualWeightBook('10000', 10000, [q], fees, time, c.newId);
    expect(benchmark.positions[0]!.availableOn).toBe(q.positionAvailableOn);
    expect(benchmark.fills[0]!.fee).toBe(q.lot === '500' ? '5' : '9');
  },
);

it('停牌、错币种、旧报价和已知未处理事件分别保留拒绝', async () => {
  const s = setup('CN', 'ETF');
  s.dsa.get.mockResolvedValueOnce({
    symbol: s.input.symbol,
    assetType: 'ETF',
    day,
    observedAt: time,
    state: 'suspended',
    evidence: {},
  });
  const halted = await s.reader.read(s.input);
  expect(halted.status === 'available' && halted.observation.buyBlocked).toBe('suspended');
  s.quote.units.priceCurrency = 'USD';
  expect(await s.reader.read(s.input)).toMatchObject({
    status: 'unavailable',
    reason: 'live_quote_unqualified',
  });
  s.quote.units.priceCurrency = 'CNY';
  s.quote.fetchedAt = '2026-11-23T03:00:00Z';
  expect(await s.reader.read(s.input)).toMatchObject({ status: 'unavailable' });
  s.quote.fetchedAt = time;
  s.quote.marketTime = '2026-11-23T01:50:00Z';
  expect(await s.reader.read(s.input)).toMatchObject({ status: 'unavailable' });
  s.quote.marketTime = time;
  s.actions.read.mockResolvedValueOnce(null);
  expect(await s.reader.read({ ...s.input, previousDay: '2026-11-20' })).toMatchObject({
    reason: 'corporate_action_unprocessed',
  });
});
