import { expect, it } from 'vitest';
import { arenaWeekStart, arenaWeeks } from '../../src/model-arena/arena-weeks.js';
import { observeWindow } from '../../src/model-arena/arena-week-analysis.js';
it('跨年半周、休市周与纽约夏令时按比赛当地日历封存', () => {
  expect(arenaWeekStart('2027-01-01')).toBe('2026-12-28');
  const p = { startsOn: '2026-10-28', endsOn: '2026-11-10', timeZone: 'America/New_York' };
  const weeks = arenaWeeks(
    p,
    new Date('2026-10-28T16:00:00Z'),
    null,
    [{ tradingDate: '2026-10-30' }, { tradingDate: '2026-11-10' }],
    new Date('2026-11-12T00:00:00Z'),
  );
  expect(weeks.map((w) => [w.week, w.cutoff.toISOString()])).toEqual([
    ['2026-10-26', '2026-10-31T04:00:00.000Z'],
    ['2026-11-02', '2026-11-09T05:00:00.000Z'],
    ['2026-11-09', '2026-11-11T05:00:00.000Z'],
  ]);
});
it('观察窗只用生效后的完整交易日，分别保留未成熟、缺价与行动口径', () => {
  const input = { roundId: 'r', day: '2026-11-02', symbol: 'A.US' },
    days = ['03', '04', '05', '06', '09'].map((d) => '2026-11-' + d);
  const f = {
    symbol: 'A.US',
    sourceRef: 'open',
    lot: '1',
    tick: '1',
    buyBlocked: null,
    sellBlocked: null,
    sellable: '0',
    openAt: '2026-11-03T14:30:00Z',
    price: '10',
  };
  const bar = (day: string) => ({
    kind: 'daily_bar' as const,
    symbol: 'A.US',
    ref: day,
    date: day,
    availableAt: day,
    observedAt: day,
    open: '10',
    low: '9',
    high: '15',
    close: '12',
  });
  expect(observeWindow(input, 5, days, f, bar, () => true)).toMatchObject({
    state: 'ready',
    change: '0.2',
    high: '0.5',
    low: '-0.1',
  });
  expect(observeWindow(input, 20, days, f, bar, () => true).state).toBe('pending');
  expect(
    observeWindow(
      input,
      5,
      days,
      f,
      () => undefined,
      () => true,
    ).state,
  ).toBe('missing_price');
  expect(observeWindow(input, 5, days, f, bar, () => false).state).toBe('basis_unverified');
});
