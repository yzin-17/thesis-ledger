import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backtestExecutionModelSchemaV3, marketPublicFeesResponseV3Schema } from '@thesis-ledger/schemas';
import { calculateExecutionModelFees } from '@thesis-ledger/domain';
import { combinePublicFeesExecutionModelV3 } from '../../src/backtest/backtest-public-fees-model-v3.js';
import { calculateBacktestV3BenchmarkReturn } from '../../src/backtest/backtest-v3-benchmark-cost.js';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'));
function model(market: 'HK' | 'US') {
  const value = fixture('backtest-execution-model.cn-2024q1.json');
  const currency = market === 'HK' ? 'HKD' : 'USD';
  value.scope = { ...value.scope, market, currency };
  for (const segment of value.segments) {
    segment.execution.calendarMarket = market;
    segment.fees.currency = currency;
    segment.fees.commission = { ...segment.fees.commission, currency, rate: '0', minimum: { kind: 'none' } };
    for (const code of ['stampDuty', 'handlingFee', 'regulatoryFee', 'transferFee']) segment.fees[code] = { treatment: 'notApplicable', reason: '受控费用隔离' };
    segment.fees.brokerCommission = fixture('backtest-broker-commission.futu.json')[market];
  }
  return backtestExecutionModelSchemaV3.parse(value);
}
describe('券商配置进入公共收费组合及成本基准', () => {
  it('公共规则覆盖公共费项，保留用户佣金和平台费原值', () => {
    const source = marketPublicFeesResponseV3Schema.parse(fixture('market-hk-public-fees-expanded-v3.response.json').response);
    const raw = model('HK'); raw.scope.symbol = source.symbol; raw.scope.range = source.range;
    for (const segment of raw.segments) {
      segment.range = source.range;
      for (const charge of source.segments[0]!.charges) {
        if (charge.code === 'tradingActivityFee') throw new Error('港股测试不能包含TAF');
        segment.fees![charge.code] = { ...segment.fees!.commission, currency: 'HKD', rate: '0' };
      }
    }
    const profile = raw.segments[0]!.fees!.brokerCommission!;
    profile.commission.rate = '0.0001'; profile.userModified = true;
    const combined = combinePublicFeesExecutionModelV3(raw, source, source.provenance.fetchedAt);
    expect(combined.segments[0]!.fees!.brokerCommission).toEqual(profile);
    const result = calculateExecutionModelFees(combined.segments[0]!.fees!, { side: 'buy', turnover: '50000', currency: 'HKD' });
    expect(result.charges.find((charge) => charge.code === 'commission')!.amount).toBe('5');
    expect(result.charges.find((charge) => charge.code === 'platformFee')!.amount).toBe('15');
    expect(result.charges.find((charge) => charge.code === 'stampDuty')!.amount).toBe('50');
  });
  it.each([['HK', 'HKD', '10000', '-0.0036'], ['US', 'USD', '1000', '-0.00398']] as const)(
    '%s成本基准同时扣买卖佣金及平台费并遵守预算', (market, currency, initialCash, expected) => {
      const fees = model(market).segments[0]!.fees!;
      const result = calculateBacktestV3BenchmarkReturn({ initialCash, firstClose: '20', lastClose: '20', slippageRate: '0', currency, buyFees: fees, sellFees: fees });
      expect(result.status).toBe('available');
      if (result.status === 'available') expect(result.value).toBe(expected);
    });
});
