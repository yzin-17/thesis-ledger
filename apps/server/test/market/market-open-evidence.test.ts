import { expect, it, vi } from 'vitest';
import { backtestInstrumentFactsRequestSchema } from '@thesis-ledger/schemas';
import { MarketOpenEvidence } from '../../src/market/market-open-evidence.js';

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
