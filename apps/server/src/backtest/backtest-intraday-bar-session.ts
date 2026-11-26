import type { TradingCalendar } from '@thesis-ledger/domain';
import { dailyBarSessionIntervals } from './backtest-daily-bar-session.js';

const minutePeriods = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '60m': 60 } as const;

const unavailableInterval = (): never => {
  throw new Error('DATA_UNAVAILABLE: 盘中行情缺少完整区间或冻结会话证明');
};

function completedInterval(
  row: Readonly<Record<string, unknown>>,
  occurred: number,
  period: number,
) {
  if (row.timeframe === '1m') {
    if (
      !['interval-start', 'interval-end'].includes(String(row.timestampConvention)) ||
      row.completionStatus !== 'complete'
    )
      return unavailableInterval();
    const opened = row.timestampConvention === 'interval-start' ? occurred : occurred - 60000;
    return { opened, closed: opened + 60000 };
  }
  const expected = row.expectedMinutes;
  if (
    row.completeness !== 'complete' ||
    !Number.isInteger(expected) ||
    typeof expected !== 'number' ||
    expected <= 0 ||
    expected > period ||
    row.observedMinutes !== expected ||
    row.missingMinutes !== 0 ||
    row.isTail !== false
  )
    return unavailableInterval();
  return { opened: occurred - expected * 60000, closed: occurred };
}

/** 原始分钟须证明开始或结束标签；受控聚合使用结束标签，完整性不得由时间猜测。 */
export function intradayBarSessionWindow(
  row: Readonly<Record<string, unknown>>,
  calendar: TradingCalendar,
): { openedAt: string; closedAt: string } {
  const timeframe = row.timeframe as keyof typeof minutePeriods;
  const period = minutePeriods[timeframe];
  const occurred = typeof row.occurredAt === 'string' ? Date.parse(row.occurredAt) : NaN;
  if (
    !period ||
    !Number.isFinite(occurred) ||
    occurred % 60000 !== 0 ||
    row.quality !== 'complete' ||
    row.suspended === true
  )
    return unavailableInterval();
  const { opened, closed } = completedInterval(row, occurred, period);
  const observed = typeof row.availableAt === 'string' ? Date.parse(row.availableAt) : NaN;
  if (!Number.isFinite(observed) || observed < closed) return unavailableInterval();
  const day = calendar.status(new Date(opened));
  if (!day.open || calendar.status(new Date(closed)).date !== day.date)
    return unavailableInterval();
  const intervals = dailyBarSessionIntervals(day.date, calendar);
  const session = intervals.find(
    (window) => opened >= window.openedAt && closed <= window.closedAt,
  );
  if (
    !session ||
    (opened - session.openedAt) % (period * 60000) !== 0 ||
    closed !== Math.min(opened + period * 60000, session.closedAt)
  )
    return unavailableInterval();
  return { openedAt: new Date(opened).toISOString(), closedAt: new Date(closed).toISOString() };
}
