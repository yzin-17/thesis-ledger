import { describe, expect, it } from 'vitest';
import { cnTradingCalendar, expectedCutoffSchedule } from '../src/index.js';

describe('NAV atOrAfterNextTradingDay 截止边界', () => {
  it.each([
    ['2026-09-08T06:59:59.999999Z', '2026-09-08'],
    ['2026-09-08T07:00:00Z', '2026-09-09'],
    ['2026-09-08T07:00:00.000001Z', '2026-09-09'],
    ['2026-09-11T07:00:00Z', '2026-09-14'],
    ['2026-09-12T08:00:00Z', '2026-09-14'],
  ])('%s 对应估值日 %s', (at, date) => {
    expect(expectedCutoffSchedule(at, cnTradingCalendar, '15:00')?.valuationDate).toBe(date);
  });
  it('下一处理日缺失时不能回退当日', () => {
    const calendar = {
      ...cnTradingCalendar,
      isTradingDay: (value: Date | string) => String(value).startsWith('2026-09-08'),
    };
    expect(expectedCutoffSchedule('2026-09-08T07:00:00Z', calendar, '15:00')).toBeUndefined();
  });
});
