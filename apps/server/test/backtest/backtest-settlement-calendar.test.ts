import { describe, expect, it } from 'vitest';
import type { TradingCalendar } from '@thesis-ledger/domain';
import {
  settlementCalendarRequirement,
  assertSettlementCalendarCoverage,
} from '../../src/backtest/backtest-settlement-calendar.js';
import { buildInput } from './v3-snapshot-fixtures.js';

describe('结算日历需求', () => {
  it('只计入运行窗口模型段，买卖结算取最大值，T+0 不扩大范围', async () => {
    const { input } = await buildInput();
    const config = input.runConfig;
    const segment = config.executionModel!.segments[0]!;
    if (segment.execution.mode !== 'exchange') throw new Error('fixture');
    segment.execution.sellableAfterTradingDays = 1;
    segment.execution.saleReinvestableAfterTradingDays = 2;
    const outside = structuredClone(segment);
    outside.range = { start: '2027-01-01', end: '2027-02-01' };
    if (outside.execution.mode !== 'exchange') throw new Error('fixture');
    outside.execution.sellableAfterTradingDays = 30;
    config.executionModel!.segments.push(outside);
    expect(settlementCalendarRequirement(config)).toMatchObject({
      tradingDays: 2,
      requestedEnd: '2026-06-09',
    });
    segment.execution.sellableAfterTradingDays = 0;
    segment.execution.saleReinvestableAfterTradingDays = 0;
    expect(settlementCalendarRequirement(config)).toMatchObject({
      tradingDays: 0,
      requestedEnd: config.endDate,
    });
  });

  it('按实际交易日跨周末和长假计数，未知或不足不能当成功', () => {
    const requirement = {
      policy: 'settlement-calendar-v1' as const,
      tradingDays: 2,
      requestedEnd: '2026-10-20',
    };
    const status = (value: Date | string) => {
      const date = new Date(value).toISOString().slice(0, 10);
      return {
        market: 'CN' as const,
        date,
        open: ['2026-10-09', '2026-10-12'].includes(date),
        reason: 'exchange-holiday' as const,
      };
    };
    const calendar = { status } as TradingCalendar;
    expect(() =>
      assertSettlementCalendarCoverage(calendar, '2026-09-30', requirement),
    ).not.toThrow();
    expect(() =>
      assertSettlementCalendarCoverage(calendar, '2026-09-30', {
        ...requirement,
        requestedEnd: '2026-10-11',
      }),
    ).toThrow('不足');
    const missing = {
      status: (value: Date | string) => ({
        ...status(value),
        reason: 'calendar-unavailable' as const,
      }),
    } as TradingCalendar;
    expect(() => assertSettlementCalendarCoverage(missing, '2026-09-30', requirement)).toThrow(
      '未知',
    );
  });
});
