import { describe, expect, it } from 'vitest';
import { calculateExecutionModelFees, type FrozenExecutionModelFees } from '../src/backtest-execution-model.js';
import { roundExecutionFeeAmount } from '../src/backtest-public-fee-calculation.js';
import { DecimalValue } from '../src/decimal.js';

function fees(currency: 'HKD' | 'USD'): FrozenExecutionModelFees {
  return { currency, collection: 'perFillPerCharge', rounding: { mode: 'halfUp', decimalPlaces: 2 },
    commission: { treatment: 'charged', side: 'both', basis: 'turnover', currency, rate: '0', minimum: { kind: 'none' } },
    stampDuty: { treatment: 'notApplicable', reason: '受控费用测试' },
    transferFee: { treatment: 'notApplicable', reason: '受控费用测试' },
    regulatoryFee: { treatment: 'notApplicable', reason: '受控费用测试' },
    handlingFee: { treatment: 'notApplicable', reason: '受控费用测试' } };
}
function usFees() {
  return { ...fees('USD'), tradingActivityFee: { treatment: 'charged' as const, side: 'sell' as const,
    basis: 'actualShares' as const, currency: 'USD' as const, rate: '0.000166', minimum: { kind: 'none' as const },
    maximumAmount: '8.30', lowPriceExemption: 'belowPerShareRate' as const } };
}
function input(quantity = '100', price = '10') {
  return { side: 'sell' as const, currency: 'USD' as const, quantity, price,
    turnover: DecimalValue.from(quantity).times(price).toString(), quantityBasis: 'actual-units' as const };
}

describe('逐项公共费额与实际股数', () => {
  it('港股印花税整元进位，SFC/AFRC分别取整，不能合并取整', () => {
    const value = fees('HKD');
    const charged = { treatment: 'charged' as const, side: 'both' as const, basis: 'turnover' as const,
      currency: 'HKD' as const, minimum: { kind: 'none' as const } };
    value.stampDuty = { ...charged, rate: '0.001', amountRounding: { mode: 'ceil', decimalPlaces: 0 } };
    value.regulatoryFee = { ...charged, rate: '0.000027' };
    value.afrcLevy = { ...charged, rate: '0.0000015' };
    value.handlingFee = { ...charged, rate: '0.0000565' };
    const result = calculateExecutionModelFees(value, { side: 'buy', currency: 'HKD', turnover: '178' });
    expect(result.charges.map(({ code, amount }) => [code, amount])).toEqual([
      ['commission', '0'], ['stampDuty', '1'], ['regulatoryFee', '0'], ['handlingFee', '0.01'], ['afrcLevy', '0']]);
    expect(result.total).toBe('1.01');
    expect(DecimalValue.from('178').times('0.0000285').dividedBy('1', 2).toString()).toBe('0.01');
  });
  it('极大金额进位保持整数精度，整元不多收一元', () => {
    expect(roundExecutionFeeAmount(DecimalValue.from('1000000000000000000000000000.001'), 2, { mode: 'ceil', decimalPlaces: 0 }))
      .toBe('1000000000000000000000000001');
    expect(roundExecutionFeeAmount(DecimalValue.from('50'), 2, { mode: 'ceil', decimalPlaces: 0 })).toBe('50');
  });
  it.each([['100', '10', '0.02'], ['50000', '10', '8.3'], ['50001', '10', '8.3'],
    ['100', '0.000165', '0'], ['100', '0.000166', '0.02']])('TAF数量%s/价格%s得费额%s', (quantity, price, total) => {
    expect(calculateExecutionModelFees(usFees(), input(quantity, price)).total).toBe(total);
  });
  it('买入不收TAF', () => {
    expect(calculateExecutionModelFees(usFees(), { ...input(), side: 'buy' }).total).toBe('0');
  });
  it('拒绝归一化、分数股、缺股数、成交额不一致', () => {
    expect(() => calculateExecutionModelFees(usFees(), { ...input(), quantityBasis: 'normalized-units' })).toThrow('实际股数');
    expect(() => calculateExecutionModelFees(usFees(), input('0.5'))).toThrow('股数');
    expect(() => calculateExecutionModelFees(usFees(), { side: 'sell', currency: 'USD', turnover: '1000' })).toThrow('实际股数');
    expect(() => calculateExecutionModelFees(usFees(), { ...input(), turnover: '2000' })).toThrow('不一致');
  });
});
