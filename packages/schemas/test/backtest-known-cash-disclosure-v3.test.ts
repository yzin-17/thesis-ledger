import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backtestKnownCashDisclosureV3Schema } from '../src/backtest-known-cash-disclosure-v3.js';
import { marketKnownCashExchangeV3Schema } from '../src/market-known-cash-wire-v3.js';

function fixture() {
  const exchange = marketKnownCashExchangeV3Schema.parse(
    JSON.parse(
      readFileSync(
        new URL('../fixtures/market-known-cash-v3.exchange.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  return backtestKnownCashDisclosureV3Schema.parse({
    version: 'known-cash-dividend-disclosure-v1',
    preparationHash: 'a'.repeat(64),
    policy: exchange.request.researchPolicy,
    scope: {
      symbol: exchange.request.symbol,
      market: 'CN',
      instrumentType: 'ETF',
      currency: 'CNY',
      startDate: exchange.request.start,
      endDate: exchange.request.end,
      dataAsOf: exchange.request.dataAsOf,
    },
    source: exchange.response.source,
    coverage: exchange.response.coverage,
    ignoredEmptyRows: 0,
    revisions: { desiredRevision: 1, effectivePolicyRevision: 1, catalogRevision: 1 },
    records: exchange.response.records.map((record) => ({
      ...record,
      eligibleQuantity: '100',
      grossCashAmount: '8.8',
      status: 'simulated-paid',
    })),
  });
}
describe('已知方案现金结果的冻结一致性', () => {
  it('保留精确税前资格乘积和未知覆盖，状态只表明计划模拟', () => {
    expect(fixture().records[0]).toMatchObject({
      eligibleQuantity: '100',
      grossCashAmount: '8.8',
      status: 'simulated-paid',
    });
    const value = fixture();
    value.records[0]!.status = 'receivable';
    expect(backtestKnownCashDisclosureV3Schema.safeParse(value).success).toBe(true);
  });
  it.each([
    'amount',
    'identity',
    'scope',
    'clock',
    'unavailable',
    'coverage',
    'invalid-quantity',
    'invalid-cash',
  ])('%s不一致拒绝', (mode) => {
    const value = fixture();
    const record = value.records[0]!;
    if (mode === 'amount') record.grossCashAmount = '888';
    if (mode === 'identity') value.source.queryIdentity.requestedSymbol = '510050.SH';
    if (mode === 'scope') value.scope.startDate = '2025-06-30';
    if (mode === 'clock') value.scope.dataAsOf = '2020-01-01T00:00:00Z';
    if (mode === 'unavailable') record.status = 'unavailable';
    if (mode === 'coverage') Object.assign(value.coverage, { complete: true });
    if (mode === 'invalid-quantity') record.eligibleQuantity = 'invalid';
    if (mode === 'invalid-cash') record.grossCashAmount = '1e3';
    expect(backtestKnownCashDisclosureV3Schema.safeParse(value).success).toBe(false);
  });
});
