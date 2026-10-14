import { describe, expect, it } from 'vitest';
import { marketPeriodCivilBucket } from '@thesis-ledger/domain';
import { planPublicPeriodCalendar } from '../../src/market/market-period-public-window.js';

describe('公开派生日历探测范围', () => {
  const evaluation = '2026-10-04T00:00:00Z';
  it('周边界沿用 Domain，跨年仍含完整尾桶', () => {
    expect(marketPeriodCivilBucket('2026-01-01', '1w')).toEqual(['2025-12-29', '2026-01-04']);
    expect(
      planPublicPeriodCalendar({ timeframe: '1w', limit: 2, indicators: [] }, evaluation),
    ).toEqual({ end: '2026-10-04', calendarRange: { start: '2026-09-14', end: '2026-10-04' } });
  });
  it('月末偏移先固定月初，闰年与跨年不溢出', () => {
    expect(marketPeriodCivilBucket('2024-03-31', '1mo', -1)).toEqual(['2024-02-01', '2024-02-29']);
    expect(marketPeriodCivilBucket('2026-01-31', '1mo', -1)).toEqual(['2025-12-01', '2025-12-31']);
    expect(marketPeriodCivilBucket('2024-02-29', '1y', -1)).toEqual(['2023-01-01', '2023-12-31']);
  });
  it('显式开始日不裁掉指标预热，limit 仍为上限', () => {
    const planned = planPublicPeriodCalendar(
      {
        timeframe: '1mo',
        limit: 3000,
        start: '2026-09-01',
        indicators: [{ name: 'MA', parameters: { period: 5 } }],
      },
      evaluation,
    );
    expect(planned.calendarRange).toEqual({ start: '2021-09-01', end: '2026-10-31' });
  });
  it('未来请求结束日夹紧评估市场日，年度仍计划完整年度', () => {
    expect(
      planPublicPeriodCalendar(
        { timeframe: '1y', limit: 2, end: '2028-12-31', indicators: [] },
        evaluation,
      ),
    ).toEqual({ end: '2026-10-04', calendarRange: { start: '2024-01-01', end: '2026-12-31' } });
  });
  it('历史请求固定尾桶而不是隐式当前年份', () => {
    expect(
      planPublicPeriodCalendar(
        { timeframe: '1y', limit: 2, end: '2020-02-20', indicators: [] },
        evaluation,
      ).calendarRange,
    ).toEqual({ start: '2018-01-01', end: '2020-12-31' });
  });
  it('显式短年度范围不会按最大 limit 探测几千年', () => {
    expect(
      planPublicPeriodCalendar(
        { timeframe: '1y', limit: 3000, start: '2026-01-01', indicators: [] },
        evaluation,
      ).calendarRange,
    ).toEqual({ start: '2025-01-01', end: '2026-12-31' });
  });
  it('5d 扩展的是日历探测范围，不伪造交易日锚点', () => {
    const input = { timeframe: '5d' as const, limit: 2, indicators: [] };
    expect(planPublicPeriodCalendar(input, evaluation).calendarRange).toEqual({
      start: '2026-08-21',
      end: '2026-10-04',
    });
    expect(planPublicPeriodCalendar(input, evaluation, 2).calendarRange.start).toBe('2026-07-22');
    expect(planPublicPeriodCalendar(input, evaluation)).not.toHaveProperty('anchorTradingDate');
  });
  it('年度 MA 的完整预热超过日历预算时拒绝', () => {
    expect(() =>
      planPublicPeriodCalendar(
        { timeframe: '1y', limit: 2, indicators: [{ name: 'MA', parameters: { period: 5 } }] },
        evaluation,
      ),
    ).toThrow('20000');
  });
  it('计算点超限与评估前开始日错误先拒绝', () => {
    expect(() =>
      planPublicPeriodCalendar(
        { timeframe: '1w', limit: 3650, indicators: [{ name: 'MA', parameters: {} }] },
        evaluation,
      ),
    ).toThrow('计算上限');
    expect(() =>
      planPublicPeriodCalendar(
        { timeframe: '1w', limit: 2, start: '2027-01-01', indicators: [] },
        evaluation,
      ),
    ).toThrow('开始日');
  });
});
