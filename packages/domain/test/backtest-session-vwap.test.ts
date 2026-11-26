import { expect, it } from 'vitest';
import { evaluateIndicator } from '../src/backtest-indicators.js';
import { DecimalValue } from '../src/decimal.js';
import {
  backtestSessionVwap,
  BacktestSessionVwapAccumulator,
  type BacktestSessionBar,
} from '../src/backtest-session-vwap.js';
import { backtestSessionClock } from '../src/backtest-session-clock.js';
import { tradingCalendarFromFact, type ExecutionCalendarFact } from '../src/execution-rules.js';

const fact: ExecutionCalendarFact = {
  market: 'CN',
  timezone: 'Asia/Shanghai',
  provider: 'fixture',
  providerRevision: '1',
  availableAt: '2026-01-01T00:00:00Z',
  range: { start: '2026-01-01', end: '2026-12-31' },
  holidays: ['2026-07-02'],
  sessions: [
    { startMinute: 570, endMinute: 690 },
    { startMinute: 780, endMinute: 900 },
  ],
  sessionOverrides: [],
};
const calendar = (patch: Partial<ExecutionCalendarFact> = {}) => ({
  calendar: tradingCalendarFromFact({ ...fact, ...patch }),
  availability: { availableAt: fact.availableAt },
});
const bar = (
  openedAt: string,
  closedAt: string,
  close = '100',
  volume = '10',
): BacktestSessionBar => ({ openedAt, closedAt, availableAt: closedAt, close, volume });
const cn = (day: string, start: string, end: string, close = '100', volume = '10') =>
  bar(`${day}T${start}:00+08:00`, `${day}T${end}:00+08:00`, close, volume);
const evaluate = (bars: BacktestSessionBar[], at = bars.at(-1)!.closedAt) =>
  backtestSessionVwap({ at, calendar: calendar(), bars });

it('顺序累计与独立重算相同；迟到可见性恢复时不永久丢弃早先行情', () => {
  const source = calendar();
  const bars = [cn('2026-07-01', '09:30', '09:31'), cn('2026-07-01', '09:31', '09:32', '120')];
  bars[0]!.availableAt = bars[1]!.closedAt;
  const accumulator = new BacktestSessionVwapAccumulator(source.calendar);
  for (const [index, value] of bars.entries()) {
    const clock = backtestSessionClock(source, value.closedAt);
    if (clock.status !== 'available') throw new Error(clock.reason);
    accumulator.append(value, clock);
    expect(accumulator.result(clock, value.closedAt)).toEqual(evaluate(bars.slice(0, index + 1)));
  }
  expect(evaluate(bars)).toMatchObject({ status: 'available', value: '110' });
});

it('相同分钟输入的当日累计与最近20根产生相反价格判断，不能互相替代', () => {
  const start = Date.parse('2026-07-01T01:30:00Z');
  const prices = [...Array<string>(20).fill('100'), ...Array<string>(10).fill('200'), '140'];
  const bars = prices.map((price, index) =>
    bar(
      new Date(start + index * 60000).toISOString(),
      new Date(start + (index + 1) * 60000).toISOString(),
      price,
    ),
  );
  const session = evaluate(bars);
  const rolling = evaluateIndicator(
    'VWAP',
    bars.map((point) => ({
      occurredAt: point.closedAt,
      availableAt: point.availableAt,
      value: point.close!,
      volume: point.volume!,
    })),
    { period: 20 },
  ).points.at(-1)!;
  expect(session.status).toBe('available');
  if (session.status !== 'available') throw new Error(session.reason);
  expect(session.withinFirstHour).toBe(true);
  expect(DecimalValue.from('140').compareTo(session.value)).toBe(1);
  expect(DecimalValue.from('140').compareTo(rolling.value!)).toBe(-1);
});

it('按同日全部已完成量价累计，首小时含第60分钟，未来行情不提前混入', () => {
  const bars = [
    cn('2026-07-01', '09:30', '10:00', '100', '10'),
    cn('2026-07-01', '10:00', '10:30', '120', '30'),
    cn('2026-07-01', '10:30', '11:00', '200', '10'),
  ];
  expect(evaluate(bars, bars[0]!.closedAt)).toMatchObject({
    status: 'available',
    value: '100',
    elapsedMinutes: 30,
    withinFirstHour: true,
  });
  expect(evaluate(bars, bars[1]!.closedAt)).toMatchObject({
    status: 'available',
    value: '115',
    elapsedMinutes: 60,
    withinFirstHour: true,
  });
  expect(evaluate(bars)).toMatchObject({ value: '132', withinFirstHour: false });
  expect(evaluate(bars, '2026-07-01T10:29:59+08:00')).toMatchObject({ status: 'unavailable' });
});

it('跨交易日重置、午休不重置；缺根、重复、交叠和未完成不能伪装累计', () => {
  const morning = cn('2026-07-01', '09:30', '11:30', '100');
  const afternoon = cn('2026-07-01', '13:00', '13:30', '120');
  expect(evaluate([morning, afternoon])).toMatchObject({ value: '110', withinFirstHour: false });
  expect(evaluate([morning], '2026-07-01T12:00:00+08:00')).toMatchObject({
    reason: 'SESSION_VWAP_OUTSIDE_SESSION',
  });
  const next = cn('2026-07-03', '09:30', '10:00', '150');
  expect(evaluate([morning, afternoon, next])).toMatchObject({
    value: '150',
    tradingDate: '2026-07-03',
  });
  for (const bars of [
    [afternoon],
    [morning, morning],
    [morning, cn('2026-07-01', '11:00', '11:30')],
    [cn('2026-07-01', '09:30', '13:30')],
  ]) {
    expect(evaluate(bars)).toMatchObject({ status: 'unavailable' });
  }
});

it('缺量、负量、坏价格、零累计量和未可见输入保持不可用，固定快照仍受截点约束', () => {
  const point = cn('2026-07-01', '09:30', '10:00');
  for (const patch of [
    { volume: undefined },
    { volume: '-1' },
    { volume: '0' },
    { close: '0' },
    { close: 'bad' },
    { availableAt: '2026-07-02T00:00:00Z' },
  ]) {
    expect(evaluate([{ ...point, ...patch }])).toMatchObject({ status: 'unavailable' });
  }
  const zero = { ...point, volume: '0' };
  const later = cn('2026-07-01', '10:00', '10:30', '120');
  expect(evaluate([zero, later])).toMatchObject({ value: '120' });
  const researchClock = {
    basis: 'fixed-provider-snapshot' as const,
    dataAsOf: '2026-07-04T00:00:00Z',
    decisionAt: point.closedAt,
  };
  const captured = { ...point, availableAt: '2026-07-03T00:00:00Z', researchClock };
  expect(evaluate([captured])).toMatchObject({ value: '100' });
  expect(evaluate([{ ...captured, availableAt: '2026-07-05T00:00:00Z' }])).toMatchObject({
    reason: 'SESSION_VWAP_BAR_NOT_VISIBLE',
  });
});

it('日历覆盖、可见性、休市、提前收市和美国夏冬时制分别读取冻结事实', () => {
  const point = cn('2026-07-01', '09:30', '10:00');
  expect(backtestSessionVwap({ at: point.closedAt, bars: [point] })).toMatchObject({
    status: 'unavailable',
  });
  for (const patch of [
    { range: { start: '2026-07-02', end: '2026-12-31' } },
    { holidays: ['2026-07-01'] },
  ]) {
    expect(
      backtestSessionVwap({ at: point.closedAt, bars: [point], calendar: calendar(patch) }),
    ).toMatchObject({ status: 'unavailable' });
  }
  const early = calendar({
    sessionOverrides: [{ date: '2026-07-01', sessions: [{ startMinute: 570, endMinute: 600 }] }],
  });
  expect(backtestSessionVwap({ at: point.closedAt, bars: [point], calendar: early })).toMatchObject(
    { value: '100', withinFirstHour: true },
  );
  expect(
    backtestSessionVwap({ at: '2026-07-01T10:01:00+08:00', bars: [point], calendar: early }),
  ).toMatchObject({ reason: 'SESSION_VWAP_OUTSIDE_SESSION' });
  const us = calendar({
    market: 'US',
    timezone: 'America/New_York',
    holidays: [],
    sessions: [{ startMinute: 570, endMinute: 960 }],
  });
  for (const [open, close] of [
    ['2026-07-01T13:30:00Z', '2026-07-01T14:30:00Z'],
    ['2026-11-02T14:30:00Z', '2026-11-02T15:30:00Z'],
  ]) {
    const b = bar(open!, close!);
    expect(backtestSessionVwap({ at: b.closedAt, bars: [b], calendar: us })).toMatchObject({
      value: '100',
      elapsedMinutes: 60,
      withinFirstHour: true,
    });
  }
  const future = { ...calendar(), availability: { availableAt: '2026-07-02T00:00:00Z' } };
  expect(
    backtestSessionVwap({ at: point.closedAt, bars: [point], calendar: future }),
  ).toMatchObject({ reason: 'SESSION_VWAP_CALENDAR_NOT_VISIBLE' });
});
