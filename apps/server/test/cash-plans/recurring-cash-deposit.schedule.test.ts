import { describe, expect, it } from 'vitest';
import {
  dueOccurrences,
  nextScheduledAtOrAfter,
  periodKeyAtShanghai,
  scheduledForPeriod,
} from '../../src/cash-plans/recurring-cash-deposit.schedule.js';

describe('定期现金入账日期规则', () => {
  it('按上海时区计算月份，并在不存在日期时取月末', () => {
    expect(periodKeyAtShanghai(new Date('2026-01-31T16:30:00.000Z'))).toBe('2026-02');
    expect(scheduledForPeriod('2026-02', 31).toISOString()).toBe('2026-02-28T01:00:00.000Z');
  });

  it('补齐从下一期到当前时间之间的全部月份', () => {
    const result = dueOccurrences(
      scheduledForPeriod('2026-06', 31),
      new Date('2026-08-31T02:00:00.000Z'),
      31,
    );
    expect(result.due.map((item) => item.periodKey)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(result.nextDueAt.toISOString()).toBe('2026-09-30T01:00:00.000Z');
  });

  it('恢复计划时跳过当前已经过去的日期', () => {
    expect(
      nextScheduledAtOrAfter(
        new Date('2026-08-31T02:00:00.000Z'),
        31,
        '2026-07',
      ).toISOString(),
    ).toBe('2026-09-30T01:00:00.000Z');
  });
});
