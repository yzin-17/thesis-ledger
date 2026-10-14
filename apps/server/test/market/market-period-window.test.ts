import { describe, expect, it } from 'vitest';
import type { MarketPeriodCalendarFact } from '@thesis-ledger/domain';
import {
  planMarketPeriodWindow,
  MarketPeriodWindowError,
} from '../../src/market/market-period-window.js';

const fixture = () => ({
  calendar: calendarFixture('2025-01-01', '2027-12-31'),
  timeframe: '1w' as const,
  evaluationAsOf: '2026-10-04T00:00:00Z',
  limit: 3,
  indicators: [],
});
function calendarFixture(start: string, end: string): MarketPeriodCalendarFact {
  const sessions: Array<MarketPeriodCalendarFact['sessions'][number]> = [];
  for (let day = Date.parse(start); day <= Date.parse(end); day += 86_400_000) {
    const date = new Date(day);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    const tradingDate = date.toISOString().slice(0, 10);
    sessions.push({
      tradingDate,
      startAt: `${tradingDate}T01:30:00.000Z`,
      endAt: `${tradingDate}T07:00:00.000Z`,
    });
  }
  return {
    market: 'CN',
    timezone: 'Asia/Shanghai',
    revision: 'controlled-window-calendar-v1',
    availableAt: '2025-01-01T00:00:00.000Z',
    coverageStart: start,
    coverageEnd: end,
    sessions,
  };
}
describe('周期窗口与双层预算', () => {
  it('可见条数按所选周期，计算窗口在其前面完整预热', () => {
    const input = {
      ...fixture(),
      indicators: [{ name: 'MA' as const, parameters: { period: 5 } }],
    };
    const plan = planMarketPeriodWindow(input);
    expect(plan.visible).toHaveLength(3);
    expect(plan.calculation).toHaveLength(62);
    expect(plan.warmup).toBe(59);
    expect(plan.availableWarmup).toBe(59);
    expect(plan.baseStart).toBe(plan.calculation[0]!.startDate);
    expect(plan.dailyPointCount).toBe(310);
    expect(plan).toEqual(planMarketPeriodWindow(input));
  });
  it('缺历史预热保留真实覆盖而不补桶', () => {
    const plan = planMarketPeriodWindow({
      ...fixture(),
      calendar: calendarFixture('2026-01-01', '2027-01-10'),
      timeframe: '1y',
      limit: 3,
      indicators: [{ name: 'MA', parameters: { period: 5 } }],
    });
    expect(plan.visible).toHaveLength(1);
    expect(plan.calculation).toHaveLength(1);
    expect(plan.availableWarmup).toBe(0);
    expect(plan.warmup).toBe(59);
  });
  it('当前月桶保留完整计划结束，基础读取不超过评估日期', () => {
    const plan = planMarketPeriodWindow({ ...fixture(), timeframe: '1mo', limit: 1 });
    expect(plan.visible[0]).toMatchObject({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      calendarComplete: true,
    });
    expect(plan.visible[0]!.endAt > fixture().evaluationAsOf).toBe(true);
    expect(plan.baseStart).toBe('2026-10-01');
    expect(plan.baseEnd).toBe('2026-10-04');
    expect(plan.dailyPointCount).toBe(2);
  });
  it('日历结束后不能把最后旧桶当作当前窗口', () => {
    const input = fixture();
    expect(() => planMarketPeriodWindow({ ...input, evaluationAsOf: '2028-01-01T00:00:00Z' })).toThrow('日历未覆盖实际请求结束日');
    expect(planMarketPeriodWindow({ ...input, evaluationAsOf: '2028-01-01T00:00:00Z', end: '2026-10-04' }).baseEnd).toBe('2026-10-04');
  });
  it('5d 读取结束绑定锚点，不获取锚点之后的日线', () => {
    const plan = planMarketPeriodWindow({
      ...fixture(),
      timeframe: '5d',
      anchorTradingDate: '2026-09-30',
      end: '2026-10-02',
    });
    expect(plan.visible).toHaveLength(3);
    expect(plan.calculation).toHaveLength(3);
    expect(plan.dailyPointCount).toBe(15);
    expect(plan.baseEnd).toBe('2026-09-30');
    expect(plan.visible.at(-1)!.endDate).toBe('2026-09-30');
  });
  it('区间开始在桶内仍获取桶开始，不裁掉第一桶事实', () => {
    const plan = planMarketPeriodWindow({ ...fixture(), start: '2026-09-30', end: '2026-10-02' });
    expect(plan.visible).toHaveLength(1);
    expect(plan.baseStart).toBe('2026-09-28');
    expect(plan.dailyPointCount).toBe(5);
  });
  it('半日、闭市和假日预算来自真实计划日期', () => {
    const input = fixture();
    input.calendar.sessions = input.calendar.sessions.filter((s) => s.tradingDate !== '2026-09-29');
    input.calendar.sessions = input.calendar.sessions.map((s) =>
      s.tradingDate === '2026-09-30' ? { ...s, endAt: '2026-09-30T03:30:00Z' } : s,
    );
    const plan = planMarketPeriodWindow({ ...input, limit: 1 });
    expect(plan.dailyPointCount).toBe(4);
    expect(plan.visible[0]!.tradingDates).not.toContain('2026-09-29');
  });
  it('跨年周使用 Domain 已有边界', () => {
    const plan = planMarketPeriodWindow({
      ...fixture(),
      evaluationAsOf: '2027-01-02T00:00:00Z',
      limit: 1,
    });
    expect(plan.visible[0]).toMatchObject({ startDate: '2026-12-28', endDate: '2027-01-03' });
  });
  it('历史窗口未来的计划范围没有可见或计算输入', () => {
    const plan = planMarketPeriodWindow({
      ...fixture(),
      start: '2026-11-01',
      end: '2026-12-31',
      timeframe: '1y',
      indicators: [{ name: 'MA', parameters: { period: 5 } }],
    });
    expect(plan.visible).toEqual([]);
    expect(plan.calculation).toEqual([]);
    expect(plan.baseStart).toBeNull();
    expect(plan.baseEnd).toBeNull();
    expect(plan.availableWarmup).toBe(0);
    expect(plan.calendarHasEarlierBucket).toBe(false);
  });
  it.each([
    [{ limit: 0 }, 'window_invalid'],
    [{ limit: 1.5 }, 'window_invalid'],
    [{ start: '2026-02-30' }, 'window_invalid'],
    [{ start: '2026-10-03', end: '2026-10-02' }, 'window_invalid'],
    [{ timeframe: '5d', anchorTradingDate: '2026-10-05' }, 'window_invalid'],
    [
      { limit: 3650, indicators: [{ name: 'MA', parameters: { period: 5 } }] },
      'calculation_input_limit',
    ],
    [
      { calendar: calendarFixture('2000-01-01', '2027-12-31'), timeframe: '1y', limit: 15 },
      'daily_input_limit',
    ],
    [
      { calendar: calendarFixture('2026-01-03', '2027-12-31'), timeframe: '1y', limit: 1 },
      'calendar_incomplete',
    ],
  ])('拒绝无效窗口或预算 %#', (patch, code) => {
    let actual: unknown;
    try {
      planMarketPeriodWindow({ ...fixture(), ...patch } as Parameters<
        typeof planMarketPeriodWindow
      >[0]);
    } catch (error) {
      actual = error;
    }
    expect(actual).toBeInstanceOf(MarketPeriodWindowError);
    expect((actual as MarketPeriodWindowError).code).toBe(code);
  });
});
