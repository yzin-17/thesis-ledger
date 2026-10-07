import { describe, expect, it } from 'vitest';
import { toCorporateAction } from '../../src/backtest/backtest-v2-execution-shared.js';

const row = {
  symbol: '510300.SH', market: 'CN', instrumentType: 'ETF', type: 'CASH_DIVIDEND',
  cashAmount: '0.1', currency: 'CNY', occurredAt: '2025-06-18T00:00:00+08:00',
  availableAt: '2025-06-01T00:00:00Z', provider: 'fixture', providerRevision: 'r1',
};
describe('冻结事件进入执行域', () => {
  it('保留各源日期与独立策略可见性', () => {
    const visibility = { kind: 'announcement', announcedAt: '2025-06-01T00:00:00Z' };
    expect(toCorporateAction({ ...row, effectiveDate: '2025-06-18', recordDate: '2025-06-17',
      paymentDate: '2025-06-27', strategyVisibility: JSON.stringify(visibility),
    })).toMatchObject({ ...row, effectiveDate: '2025-06-18', recordDate: '2025-06-17',
      paymentDate: '2025-06-27', strategyVisibility: visibility,
    });
  });
  it('旧事实不补造日期或策略可见性，损坏的可见性拒绝转换', () => {
    expect(toCorporateAction(row)).not.toHaveProperty('strategyVisibility');
    expect(toCorporateAction(row)).not.toHaveProperty('effectiveDate');
    expect(() => toCorporateAction({ ...row, strategyVisibility: '{}' })).toThrow();
  });
});
