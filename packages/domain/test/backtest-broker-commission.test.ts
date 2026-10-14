import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateBrokerCommission, type FrozenBrokerCommission } from '../src/backtest-broker-commission.js';
import { calculateExecutionModelFees, type FrozenExecutionModelFees } from '../src/backtest-execution-model.js';

const profiles = (): Record<'HK' | 'US', FrozenBrokerCommission> => JSON.parse(readFileSync(new URL('../../schemas/fixtures/backtest-broker-commission.futu.json', import.meta.url), 'utf8'));
const fees = (): FrozenExecutionModelFees => {
  const value = JSON.parse(readFileSync(new URL('../../schemas/fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url), 'utf8')).segments[0].fees;
  value.currency = 'HKD'; value.commission = { ...value.commission, currency: 'HKD', rate: '0', minimum: { kind: 'none' } };
  for (const key of ['stampDuty', 'handlingFee', 'transferFee', 'regulatoryFee']) value[key] = { treatment: 'notApplicable', reason: '受控隔离券商成本' };
  value.brokerCommission = profiles().HK; return value;
};
describe('富途券商成本与独立平台费', () => {
  it.each([['1000', '3', '15'], ['50000', '15', '15']])('港股成交额%s保留最低佣金和固定平台费', (turnover, commission, platformFee) => {
    expect(calculateBrokerCommission(profiles().HK, { turnover, currency: 'HKD' }).map((item) => item.amount)).toEqual([commission, platformFee]);
  });
  it('双侧逐项扣收，并和公共费项独立相加', () => {
    const value = fees(); value.handlingFee = { ...value.commission, rate: '0.0000565' };
    for (const side of ['buy', 'sell'] as const)
      expect(calculateExecutionModelFees(value, { side, turnover: '50000', currency: 'HKD' }).total).toBe('32.83');
  });
  it('参考股价改变按股成本，不依赖归一化数量', () => {
    const profile = profiles().US;
    const input = { turnover: '50000', currency: 'USD' as const, quantityBasis: 'normalized-units' as const, quantity: '1' };
    expect(calculateBrokerCommission(profile, input).map((item) => item.amount)).toEqual(['12.25', '12.5']);
    profile.basis = { kind: 'referencePrice', price: '10' };
    expect(calculateBrokerCommission(profile, input).map((item) => item.amount)).toEqual(['24.5', '25']);
  });
  it('两项分别封顶，冲突时每单最低额优先', () => {
    expect(calculateBrokerCommission(profiles().US, { turnover: '1', currency: 'USD' }).map((item) => item.amount)).toEqual(['0.99', '1']);
    const profile = profiles().US; profile.basis = { kind: 'referencePrice', price: '0.5' };
    expect(calculateBrokerCommission(profile, { turnover: '1000', currency: 'USD' }).map((item) => item.amount)).toEqual(['5', '5']);
  });
  it('真实股数模式拒绝归一化、缺价及股数金额矛盾', () => {
    const profile = profiles().US; profile.basis = { kind: 'actualShares' };
    const input = { turnover: '2000', currency: 'USD' as const, quantity: '100', price: '20', quantityBasis: 'actual-units' as const };
    expect(calculateBrokerCommission(profile, input).map((item) => item.amount)).toEqual(['0.99', '1']);
    expect(() => calculateBrokerCommission(profile, { ...input, quantityBasis: 'normalized-units' })).toThrow('实际股数');
    expect(() => calculateBrokerCommission(profile, { ...input, quantity: '200' })).toThrow('不一致');
    expect(() => calculateBrokerCommission(profile, { turnover: '2000', currency: 'USD' })).toThrow('实际股数');
  });
  it('拒绝佣金重复扣收、零参考股价和币种错配', () => {
    const value = fees(); value.commission.rate = '0.0003';
    expect(() => calculateExecutionModelFees(value, { side: 'buy', turnover: '1000', currency: 'HKD' })).toThrow('重复');
    const profile = profiles().US; profile.basis = { kind: 'referencePrice', price: '0' };
    expect(() => calculateBrokerCommission(profile, { turnover: '1000', currency: 'USD' })).toThrow('参考股价');
    expect(() => calculateBrokerCommission(profiles().HK, { turnover: '1000', currency: 'USD' })).toThrow('币种');
  });
});
