import { afterEach, expect, it, vi } from 'vitest';
import { backtestInstrumentFactsRequestSchema } from '@thesis-ledger/schemas';
import { MarketOpenEvidence } from '../../src/market/market-open-evidence.js';

afterEach(() => vi.useRealTimers());

it.each([0, 10])('有效开盘资料保留价格限制，昨收 %s 单独判断能否计算', async (previousClose) => {
  const openAt = new Date('2026-11-06T01:30:00Z');
  vi.useFakeTimers();
  vi.setSystemTime(openAt);
  const market = {
    getQuote: vi.fn().mockResolvedValue({
      symbol: '600036.SH',
      units: { priceCurrency: 'CNY' },
      stale: false,
      marketTime: openAt.toISOString(),
      open: 10,
      previousClose,
      provider: 'controlled',
      fetchedAt: openAt.toISOString(),
    }),
  };
  const status = {
    read: vi.fn().mockResolvedValue({
      days: [
        {
          date: '2026-11-06',
          state: 'normal',
          noDailyPriceLimit: false,
          dailyPriceLimit: { maxUpRatio: '0.1', maxDownRatio: '0.1' },
          intradayHalts: [],
        },
      ],
      provenance: { providerRevision: 'controlled-status' },
    }),
  };
  const dsa = {
    backtestInstrumentFacts: vi.fn().mockResolvedValue({
      status: 'supported',
      coverage: { complete: true },
      facts: [
        {
          symbol: '600036.SH',
          market: 'CN',
          currency: 'CNY',
          instrumentType: 'STOCK',
          availableAt: openAt.toISOString(),
          lotSize: '100',
          tickSize: '0.01',
          tradable: true,
          providerRevision: 'controlled-rule',
          executionRules: {
            status: 'supported',
            range: { start: '2026-11-06', end: '2026-11-06' },
            positionSettlement: { sellableAfterTradingDays: 1 },
            cashSettlement: { sellCreditAfterTradingDays: 0, buyDebitAfterTradingDays: 0 },
          },
        },
      ],
    }),
  };
  const actions = { read: vi.fn() };
  const reader = new MarketOpenEvidence(
    market as never,
    status as never,
    actions as never,
    dsa as never,
  );
  const result = await reader.read({
    symbol: '600036.SH',
    assetType: 'STOCK',
    market: 'CN',
    currency: 'CNY',
    timeZone: 'Asia/Shanghai',
    openAt,
    previousDay: '2026-11-05',
    held: '0',
    now: openAt,
  });
  if (previousClose === 0) {
    expect(result).toEqual({ status: 'unavailable', reason: 'price_limit_unknown' });
  } else {
    expect(result).toMatchObject({
      status: 'available',
      fact: {
        price: '10',
        lot: '100',
        tick: '0.01',
        upperLimit: '11',
        lowerLimit: '9',
        buyBlocked: null,
        sellBlocked: null,
        sellable: '0',
      },
    });
  }
  expect(actions.read).not.toHaveBeenCalled();
});

it.each([
  [[], 'market_rules_unqualified'],
  [['historicalTradability'], 'opening_tradability_missing'],
  [['executionRules'], 'opening_execution_rules_missing'],
  [['historicalTradability', 'executionRules'], 'opening_tradability_and_rules_missing'],
] as const)('开盘规则缺项 %j 使用稳定原因码 %s，并在读取行情前返回', async (fields, reason) => {
  const openAt = new Date('2026-11-06T01:30:00Z');
  const getQuote = vi.fn();
  const facts = vi.fn((input: unknown) => {
    const request = backtestInstrumentFactsRequestSchema.parse(input);
    expect(request.dataAsOf).toBe(openAt.toISOString());
    expect(request.executionStart).toBe('2026-11-06');
    return {
      status: 'unavailable',
      facts: [],
      coverage: { complete: false },
      missingInputs: fields.map((field) => ({ field })),
    };
  });
  const reader = new MarketOpenEvidence(
    { getQuote } as never,
    {} as never,
    {} as never,
    { backtestInstrumentFacts: facts } as never,
  );
  expect(
    await reader.read({
      assetType: 'STOCK',
      market: 'CN',
      currency: 'CNY',
      symbol: '600036.SH',
      timeZone: 'Asia/Shanghai',
      held: '0',
      previousDay: '2026-11-05',
      openAt,
      now: openAt,
    }),
  ).toEqual({ status: 'unavailable', reason });
  expect(facts).toHaveBeenCalledTimes(1);
  expect(getQuote).not.toHaveBeenCalled();
});
