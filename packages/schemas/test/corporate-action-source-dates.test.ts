import { describe, expect, it } from 'vitest';
import { corporateActionFactSchema } from '../src/backtest-data.js';

const fact = {
  symbol: '510300.SH',
  market: 'CN',
  instrumentType: 'ETF',
  type: 'CASH_DIVIDEND',
  cashAmount: '0.088',
  currency: 'CNY',
  effectiveDate: '2025-06-18',
  occurredAt: '2025-06-18T00:00:00+08:00',
  availableAt: '2026-09-27T00:00:00Z',
  provider: 'akshare',
  providerRevision: 'fixture-v1',
};

describe('公司行动源日期合同', () => {
  it('保留独立日期且不产生策略可见性', () => {
    const value = corporateActionFactSchema.parse({
      ...fact,
      recordDate: '2025-06-17',
      paymentDate: '2025-06-27',
    });
    expect(value.recordDate).toBe('2025-06-17');
    expect(value.paymentDate).toBe('2025-06-27');
    expect(value.availableAt).toBe(fact.availableAt);
    expect(value.strategyVisibility).toBeUndefined();
    expect(corporateActionFactSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
  });

  it('兼容不包含新日期的旧事实', () => {
    const { effectiveDate, ...legacy } = fact;
    expect(effectiveDate).toBe('2025-06-18');
    expect(corporateActionFactSchema.parse(legacy)).toEqual(legacy);
  });

  it.each(['recordDate', 'paymentDate'])('拒绝非法 %s 或缺生效日', (field) => {
    expect(corporateActionFactSchema.safeParse({ ...fact, [field]: '2025-02-30' }).success).toBe(
      false,
    );
    expect(
      corporateActionFactSchema.safeParse({
        ...fact,
        effectiveDate: undefined,
        [field]: '2025-06-17',
      }).success,
    ).toBe(false);
  });

  it('不把中国市场登记日顺序强加给其他市场', () => {
    expect(
      corporateActionFactSchema.safeParse({
        ...fact,
        market: 'US',
        symbol: 'TEST',
        currency: 'USD',
        recordDate: '2025-06-19',
      }).success,
    ).toBe(true);
  });
});
