import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { backtestExecutionModelSchemaV3 } from '../src/backtest-execution-model.js';
import { executionCombinationIssues } from '../src/backtest-execution-combinations.js';

function input() {
  const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
  const model = fixture('backtest-execution-model.cn-2024q1.json');
  model.scope = { ...model.scope, symbol: 'AAPL.US', market: 'US', currency: 'USD', timezone: 'America/New_York' };
  for (const segment of model.segments) {
    segment.execution.calendarMarket = 'US';
    segment.fees.currency = 'USD';
    segment.fees.commission = { ...segment.fees.commission, currency: 'USD', rate: '0', minimum: { kind: 'none' } };
    for (const key of ['stampDuty', 'handlingFee', 'transferFee', 'regulatoryFee'])
      segment.fees[key] = { treatment: 'notApplicable', reason: '受控成本隔离' };
    segment.fees.brokerCommission = { ...fixture('backtest-broker-commission.futu.json').US,
      basis: { kind: 'actualShares' } };
  }
  return { model: backtestExecutionModelSchemaV3.parse(model),
    accountingBasis: 'raw-events' as const, dailyOrders: true,
    matching: { conflict: 'stopFirst' as const, childActivation: 'openSameBarRangeNextBar' as const,
      partialExit: 'protectRemaining' as const, liquidity: { kind: 'perBarCap' as const, quantity: '10' } },
    startDate: model.scope.range.start, endDate: model.scope.range.end,
  };
}

it('只拒绝实际份额按股费用与部分成交的共同启用，不改原配置', () => {
  const value = input(), before = JSON.stringify(value);
  expect(executionCombinationIssues(value)).toMatchObject([
    { code: 'PARTIAL_ACTUAL_SHARE_FEES_UNSUPPORTED', path: ['executionModel', 'segments', 0, 'fees', 'brokerCommission', 'basis'] },
  ]);
  expect(JSON.stringify(value)).toBe(before);
});

it.each(['wholeOrder', 'unlimited'] as const)('%s不受部分成交计费限制影响', (kind) => {
  const value = input();
  expect(executionCombinationIssues({ ...value, matching: { ...value.matching, liquidity: { kind } } })).toEqual([]);
});

it('未启用该撮合、非实际份额口径、范围外分段与参考股价收费不扩大限制', () => {
  const value = input();
  expect(executionCombinationIssues({ ...value, dailyOrders: false })).toEqual([]);
  expect(executionCombinationIssues({ ...value, accountingBasis: 'normalized-series' })).toEqual([]);
  expect(executionCombinationIssues({ ...value, startDate: '2030-01-01', endDate: '2030-01-31' })).toEqual([]);
  value.model.segments[0]!.fees!.brokerCommission!.basis = { kind: 'referencePrice', price: '20' };
  expect(executionCombinationIssues(value)).toEqual([]);
});
