import { describe, expect, it } from 'vitest';
import { cnTradingCalendar, type BacktestCorporateActionFact } from '@thesis-ledger/domain';
import { prepareEventAccountingV3 } from '../../src/backtest/backtest-event-accounting-v3.js';

const fact: BacktestCorporateActionFact = {
  symbol: '510300.SH',
  market: 'CN',
  instrumentType: 'ETF',
  type: 'CASH_DIVIDEND',
  cashAmount: '0.1',
  currency: 'CNY',
  effectiveDate: '2025-06-18',
  occurredAt: '2025-05-20T00:00:00Z',
  availableAt: '2025-05-20T00:00:00Z',
  provider: 'fixture',
  providerRevision: 'r1',
};
const input = {
  calendar: cnTradingCalendar,
  bars: [{ openedAt: '2025-06-18T01:30:00Z' }],
  startDate: '2025-06-01',
  endDate: '2025-06-30',
  dataAsOf: '2026-01-01T00:00:00Z',
};
describe('V3 事件经济调度', () => {
  it('窗口前记录、窗口内生效使用冻结开盘，缺策略可见性允许记账', () => {
    const [result] = prepareEventAccountingV3([fact], input);
    expect(result).toEqual({ ...fact, accountingAt: '2025-06-18T01:30:00Z' });
    expect(result).not.toHaveProperty('strategyVisibility');
    expect(fact).not.toHaveProperty('accountingAt');
  });
  it('仅预热所需或运行窗口外的事件不计入持仓', () => {
    expect(prepareEventAccountingV3([{ ...fact, effectiveDate: '2025-05-30' }], input)).toEqual([]);
    expect(prepareEventAccountingV3([{ ...fact, effectiveDate: '2025-07-01' }], input)).toEqual([]);
  });
  it('晚观测即便早于 dataAsOf 仍拒绝，不移至窗口末尾入账', () => {
    expect(() =>
      prepareEventAccountingV3([{ ...fact, availableAt: '2025-07-01T00:00:00Z' }], input),
    ).toThrow('生效记账时尚不可用');
  });
  it('同一毫秒内晚于冻结开盘或 dataAsOf 的事件不可入账', () => {
    expect(() =>
      prepareEventAccountingV3([{ ...fact, availableAt: '2025-06-18T01:30:00.000002Z' }], {
        ...input,
        dataAsOf: '2025-06-18T01:30:00.000003Z',
      }),
    ).toThrow('生效记账时尚不可用');
    expect(() =>
      prepareEventAccountingV3([{ ...fact, availableAt: '2025-06-18T01:30:00.000002Z' }], {
        ...input,
        dataAsOf: '2025-06-18T01:30:00.000001Z',
      }),
    ).toThrow('生效记账时尚不可用');
    expect(
      prepareEventAccountingV3([{ ...fact, availableAt: '2025-06-18T01:29:59.999999Z' }], {
        ...input,
        dataAsOf: '2025-06-18T01:30:00Z',
      }),
    ).toHaveLength(1);
  });
  it('同一毫秒内有多个冻结开盘时使用最早的实际时间', () => {
    expect(() =>
      prepareEventAccountingV3([{ ...fact, availableAt: '2025-06-18T01:30:00.000002Z' }], {
        ...input,
        bars: [
          { openedAt: '2025-06-18T01:30:00.000003Z' },
          { openedAt: '2025-06-18T01:30:00.000001Z' },
        ],
      }),
    ).toThrow('生效记账时尚不可用');
  });
  it('缺明确生效日或该日冻结开盘时拒绝', () => {
    const missing = { ...fact };
    delete missing.effectiveDate;
    expect(() => prepareEventAccountingV3([missing], input)).toThrow('缺少明确生效日');
    expect(() => prepareEventAccountingV3([fact], { ...input, bars: [] })).toThrow();
  });
  it('不以非交易时段或其他日期的 Bar 代替经济生效开盘', () => {
    expect(() =>
      prepareEventAccountingV3([fact], {
        ...input,
        bars: [{ openedAt: '2025-06-18T00:00:00Z' }, { openedAt: '2025-06-19T01:30:00Z' }],
      }),
    ).toThrow();
  });
});
