import { DecimalValue } from './decimal.js';
import {
  isAvailableForDecisionAt,
  availabilityForDecision,
  mergeBacktestAvailability,
  type BacktestAvailability,
} from './backtest-observation-clock.js';
import {
  backtestSessionClock,
  backtestSessionMinute,
  type BacktestSessionCalendar,
} from './backtest-session-clock.js';

export interface BacktestSessionBar extends BacktestAvailability {
  openedAt: string;
  closedAt: string;
  close?: string;
  volume?: string;
}

export type BacktestSessionVwapResult =
  | {
      status: 'available';
      tradingDate: string;
      value: string;
      elapsedMinutes: number;
      withinFirstHour: boolean;
    }
  | { status: 'unavailable'; reason: string };

const unavailable = (reason: string): BacktestSessionVwapResult => ({
  status: 'unavailable',
  reason: 'SESSION_VWAP_' + reason,
});

type SessionClock = Extract<ReturnType<typeof backtestSessionClock>, { status: 'available' }>;

/** 一次回放内按完成顺序追加；对象归属一个交易日，跨日由调用者新建。 */
export class BacktestSessionVwapAccumulator {
  private cursor: number | undefined;
  private day: string | undefined;
  private total = DecimalValue.from('0');
  private quantity = DecimalValue.from('0');
  private availability: BacktestAvailability | undefined;
  private error: string | undefined;

  constructor(private readonly calendar: BacktestSessionCalendar['calendar']) {}

  inputAvailability(): BacktestAvailability | undefined {
    return this.availability;
  }

  append(bar: BacktestSessionBar, clock: SessionClock): void {
    if (this.error) return;
    const fail = (reason: string) => {
      this.error = reason;
    };
    const interval = this.interval(bar, clock);
    if ('error' in interval) return fail(interval.error);
    if (this.day && this.day !== clock.tradingDate) return fail('BAR_INTERVAL');
    this.day = clock.tradingDate;
    const { start, end } = interval;
    if (
      !clock.sessions.some((session) => start >= session.start && end <= session.end) ||
      end <= start
    )
      return fail('BAR_OUTSIDE_SESSION');
    this.cursor ??= clock.sessions[0]!.start;
    const previous = clock.sessions.findIndex((window) => window.end === this.cursor);
    if (previous >= 0 && clock.sessions[previous + 1])
      this.cursor = clock.sessions[previous + 1]!.start;
    if (start !== this.cursor) return fail('BAR_COVERAGE');
    if (availabilityForDecision(bar) === undefined) return fail('BAR_NOT_VISIBLE');
    try {
      if (bar.close === undefined || bar.volume === undefined) return fail('MISSING_INPUT');
      const close = DecimalValue.from(bar.close),
        volume = DecimalValue.from(bar.volume);
      if (!close.isPositive() || volume.isNegative()) return fail('INVALID_INPUT');
      this.total = this.total.plus(close.times(volume));
      this.quantity = this.quantity.plus(volume);
      this.availability = this.availability
        ? mergeBacktestAvailability([this.availability, bar])
        : bar;
    } catch {
      return fail('INVALID_INPUT');
    }
    this.cursor = end;
  }

  private interval(
    bar: BacktestSessionBar,
    clock: SessionClock,
  ): { error: string } | { start: number; end: number } {
    const opened = Date.parse(bar.openedAt),
      closed = Date.parse(bar.closedAt);
    if (
      !Number.isFinite(opened) ||
      !Number.isFinite(closed) ||
      opened >= closed ||
      this.calendar.status(bar.openedAt).date !== clock.tradingDate ||
      this.calendar.status(bar.closedAt).date !== clock.tradingDate
    )
      return { error: 'BAR_INTERVAL' };
    return {
      start: backtestSessionMinute(opened, this.calendar.timezone),
      end: backtestSessionMinute(closed, this.calendar.timezone),
    };
  }

  result(clock: SessionClock, at: string): BacktestSessionVwapResult {
    if (this.error) return unavailable(this.error);
    if (this.cursor === undefined || !this.availability) return unavailable('NO_COMPLETED_BARS');
    if (!isAvailableForDecisionAt(this.availability, at)) return unavailable('BAR_NOT_VISIBLE');
    if (this.day !== clock.tradingDate || this.cursor !== clock.minute)
      return unavailable('BAR_COVERAGE');
    if (this.quantity.isZero()) return unavailable('ZERO_VOLUME');
    return {
      status: 'available',
      tradingDate: clock.tradingDate,
      value: this.total.dividedBy(this.quantity, 20).toString(),
      elapsedMinutes: clock.elapsedMinutes,
      withinFirstHour: clock.withinFirstHour,
    };
  }
}

/** 累计只消费显式完成的同源行情；日历只决定交易事实，不生成缺失行情。 */
export function backtestSessionVwap(input: {
  at: string;
  calendar?: BacktestSessionCalendar;
  bars: readonly BacktestSessionBar[];
}): BacktestSessionVwapResult {
  const now = Date.parse(input.at);
  const clock = backtestSessionClock(input.calendar, input.at);
  if (clock.status === 'unavailable') return unavailable(clock.reason);
  const calendar = input.calendar!.calendar;
  const { tradingDate } = clock;
  const bars = input.bars
    .filter((bar) => {
      const closed = Date.parse(bar.closedAt);
      return (
        Number.isFinite(closed) &&
        closed <= now &&
        calendar.status(bar.closedAt).date === tradingDate
      );
    })
    .sort((left, right) => Date.parse(left.openedAt) - Date.parse(right.openedAt));
  const accumulator = new BacktestSessionVwapAccumulator(calendar);
  for (const bar of bars) accumulator.append(bar, clock);
  return accumulator.result(clock, input.at);
}
