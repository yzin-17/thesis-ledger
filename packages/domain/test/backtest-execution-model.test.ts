import { describe, expect, it } from 'vitest';
import {
  calculateExecutionModelFees,
  calculateNavExecutionModelFee,
  type FrozenExecutionModelFees,
  type FrozenNavExecutionModelChargedFee,
} from '../src/backtest-execution-model.js';

const fees = (): FrozenExecutionModelFees => ({
  currency: 'CNY',
  collection: 'perFillPerCharge',
  rounding: { mode: 'halfUp', decimalPlaces: 2 },
  commission: {
    treatment: 'charged',
    side: 'both',
    basis: 'turnover',
    currency: 'CNY',
    rate: '0.0003',
    minimum: { kind: 'amount', amount: '5' },
  },
  stampDuty: {
    treatment: 'charged',
    side: 'sell',
    basis: 'turnover',
    currency: 'CNY',
    rate: '0.0005',
    minimum: { kind: 'none' },
  },
  transferFee: {
    treatment: 'charged',
    side: 'both',
    basis: 'turnover',
    currency: 'CNY',
    rate: '0.00001',
    minimum: { kind: 'none' },
  },
  regulatoryFee: { treatment: 'includedInCommission', reason: '含规费佣金' },
  handlingFee: { treatment: 'includedInCommission', reason: '含规费佣金' },
});

const navFee = (
  side: 'buy' | 'sell',
  basis: 'subscriptionApplicationAmount' | 'redemptionGrossProceeds',
): FrozenNavExecutionModelChargedFee => ({
  treatment: 'charged',
  side,
  basis,
  currency: 'CNY',
  rate: '0.01',
  minimum: { kind: 'none' },
  rounding: { mode: 'halfUp', decimalPlaces: 2 },
  collection: 'perApplication',
  collectedAt: 'confirmation',
});

describe('研究费用模型', () => {
  it('先逐项舍入再汇总，不通过二进制浮点数计算', () => {
    const result = calculateExecutionModelFees(fees(), {
      side: 'sell',
      turnover: '1010',
      currency: 'CNY',
    });
    expect(result.charges.map((charge) => charge.amount)).toEqual(['5', '0.51', '0.01']);
    expect(result.total).toBe('5.52');
  });
  it('净佣金模型单独扣规费，含规费模型不重复扣收', () => {
    const model = fees();
    const input = { side: 'buy' as const, turnover: '100000', currency: 'CNY' as const };
    expect(calculateExecutionModelFees(model, input).total).toBe('31');
    model.regulatoryFee = { ...model.commission, rate: '0.00002', minimum: { kind: 'none' } };
    model.handlingFee = { ...model.commission, rate: '0.0000341', minimum: { kind: 'none' } };
    expect(calculateExecutionModelFees(model, input).total).toBe('36.41');
  });
  it('执行币种不符、单项币种不符及负成交额失败', () => {
    expect(() =>
      calculateExecutionModelFees(fees(), { side: 'buy', turnover: '1000', currency: 'USD' }),
    ).toThrow('币种');
    const model = fees();
    model.commission.currency = 'USD';
    expect(() =>
      calculateExecutionModelFees(model, { side: 'buy', turnover: '1000', currency: 'CNY' }),
    ).toThrow('币种');
    expect(() =>
      calculateExecutionModelFees(fees(), { side: 'buy', turnover: '-1', currency: 'CNY' }),
    ).toThrow('成交金额');
  });

  it('NAV 申购按不含费用的申请金额逐申请计费，并在半分边界 half-up', () => {
    expect(
      calculateNavExecutionModelFee(navFee('buy', 'subscriptionApplicationAmount'), {
        code: 'subscriptionFee',
        side: 'buy',
        basis: 'subscriptionApplicationAmount',
        gross: '100.5',
        currency: 'CNY',
      }),
    ).toEqual({ code: 'subscriptionFee', amount: '1.01', currency: 'CNY' });
  });

  it('NAV 赎回按确认份额乘确认 NAV 的费前款逐申请计费，并先应用最低额再舍入', () => {
    const fee = navFee('sell', 'redemptionGrossProceeds');
    fee.rate = '0.0001';
    fee.minimum = { kind: 'amount', amount: '0.005' };
    expect(
      calculateNavExecutionModelFee(fee, {
        code: 'redemptionFee',
        side: 'sell',
        basis: 'redemptionGrossProceeds',
        gross: '10',
        currency: 'CNY',
      }),
    ).toEqual({ code: 'redemptionFee', amount: '0.01', currency: 'CNY' });
  });

  it('NAV 不适用费用必须显式说明，且不产生扣款', () => {
    expect(
      calculateNavExecutionModelFee(
        {
          treatment: 'notApplicable',
          side: 'buy',
          basis: 'subscriptionApplicationAmount',
          currency: 'CNY',
          collection: 'perApplication',
          collectedAt: 'confirmation',
          reason: '该受控产品配置不收申购费',
        },
        {
          code: 'subscriptionFee',
          side: 'buy',
          basis: 'subscriptionApplicationAmount',
          gross: '100',
          currency: 'CNY',
        },
      ),
    ).toEqual({ code: 'subscriptionFee', amount: '0', currency: 'CNY' });
  });

  it.each([
    ['side', (fee: FrozenNavExecutionModelChargedFee) => Object.assign(fee, { side: 'sell' })],
    [
      'basis',
      (fee: FrozenNavExecutionModelChargedFee) => Object.assign(fee, { basis: 'turnover' }),
    ],
    [
      'currency',
      (fee: FrozenNavExecutionModelChargedFee) => Object.assign(fee, { currency: 'USD' }),
    ],
    [
      'rounding',
      (fee: FrozenNavExecutionModelChargedFee) =>
        Object.assign(fee, { rounding: { mode: 'down', decimalPlaces: 2 } }),
    ],
    [
      'collection',
      (fee: FrozenNavExecutionModelChargedFee) =>
        Object.assign(fee, { collection: 'perFillPerCharge' }),
    ],
  ])('Domain 拒绝非法 NAV %s 契约', (_field, mutate) => {
    const fee = navFee('buy', 'subscriptionApplicationAmount');
    mutate(fee);
    expect(() =>
      calculateNavExecutionModelFee(fee, {
        code: 'subscriptionFee',
        side: 'buy',
        basis: 'subscriptionApplicationAmount',
        gross: '100',
        currency: 'CNY',
      }),
    ).toThrow();
  });
});
