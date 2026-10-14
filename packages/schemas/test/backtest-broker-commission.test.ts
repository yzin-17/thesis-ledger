import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { executionModelFeesSchema, executionModelFeesV3Schema, backtestExecutionModelSchemaV3, executionModelAccountingIssuesV3 } from '../src/backtest-execution-model.js';
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
function model(market: 'HK' | 'US' = 'HK') {
  const value = fixture('backtest-execution-model.cn-2024q1.json');
  const currency = market === 'HK' ? 'HKD' : 'USD';
  value.scope = { ...value.scope, market, currency };
  for (const segment of value.segments) {
    segment.execution.calendarMarket = market;
    segment.fees.currency = currency;
    segment.fees.commission = { ...segment.fees.commission, currency, rate: '0', minimum: { kind: 'none' } };
    for (const key of ['stampDuty', 'handlingFee', 'transferFee', 'regulatoryFee']) segment.fees[key] = { treatment: 'notApplicable', reason: '受控隔离成本' };
    segment.fees.brokerCommission = fixture('backtest-broker-commission.futu.json')[market];
  }
  return value;
}
describe('V3券商成本合同', () => {
  it('V3接受已明确口径，旧V1/V2拒绝新增配置', () => {
    const value = model().segments[0].fees;
    expect(executionModelFeesV3Schema.safeParse(value).success).toBe(true);
    expect(executionModelFeesSchema.safeParse(value).success).toBe(false);
  });
  it('拒绝佣金重复、包含公共费用、错误币种及无效参考价', () => {
    const value = model().segments[0].fees; value.commission.rate = '0.0003';
    expect(executionModelFeesV3Schema.safeParse(value).success).toBe(false);
    const other = model().segments[0].fees; other.handlingFee = { treatment: 'includedInCommission', reason: '未证实包含关系' };
    expect(executionModelFeesV3Schema.safeParse(other).success).toBe(false);
    const us = model('US').segments[0].fees; us.brokerCommission.basis.price = '0';
    expect(executionModelFeesV3Schema.safeParse(us).success).toBe(false);
    const currency = model().segments[0].fees; currency.currency = 'CNY';
    expect(executionModelFeesV3Schema.safeParse(currency).success).toBe(false);
  });
  it('归一化研究拒绝真实股数模式', () => {
    const value = model('US'); value.segments[0].fees.brokerCommission.basis = { kind: 'actualShares' };
    const parsed = backtestExecutionModelSchemaV3.parse(value);
    expect(executionModelAccountingIssuesV3(parsed, { startDate: value.scope.range.start, endDate: value.scope.range.end }, 'normalized-series')
      .some((issue) => issue.message.includes('真实股数'))).toBe(true);
  });
});
