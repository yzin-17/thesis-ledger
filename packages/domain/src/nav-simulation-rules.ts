import type { TradingCalendar } from './trading-calendar.js';
import type { CnNavSimulationRejectCode } from './nav-simulation-contracts.js';

export interface NavEventTime {
  occurredAt: string;
  availableAt: string;
}

export const navTime = (value: string) => Date.parse(value);

export const navLocalDate = (value: string, timezone: string) => {
  const instant = navTime(value);
  if (!Number.isFinite(instant)) return undefined;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const fields = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
  return `${fields.year}-${fields.month}-${fields.day}`;
};

export const navLocalClock = (value: string, timezone: string) => {
  const instant = navTime(value);
  if (!Number.isFinite(instant)) return undefined;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.hour}:${parts.minute}:${parts.second}`;
};

export const nextTradingDate = (calendar: TradingCalendar, date: string) => {
  const cursor = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(cursor.getTime())) return undefined;
  for (let index = 0; index < 370; index += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const candidate = cursor.toISOString().slice(0, 10);
    if (calendar.isTradingDay(`${candidate}T12:00:00Z`)) return candidate;
  }
  return undefined;
};

export const tradingDateAfter = (
  calendar: TradingCalendar,
  date: string,
  tradingDays: number,
) => {
  if (!Number.isInteger(tradingDays) || tradingDays < 0) return undefined;
  let current = date;
  for (let index = 0; index < tradingDays; index += 1) {
    current = nextTradingDate(calendar, current) ?? '';
    if (!current) return undefined;
  }
  return current;
};

const localTimestamp = (date: string, clock: string, timezone: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = clock.split(':').map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    ![year, month, day, hour, minute].every(Number.isFinite)
  )
    return undefined;
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const target = Date.UTC(year, month - 1, day, hour, minute);
  for (let index = 0; index < 4; index += 1) {
    const renderedDate = navLocalDate(candidate.toISOString(), timezone);
    const renderedClock = navLocalClock(candidate.toISOString(), timezone);
    if (`${renderedDate}T${renderedClock}` === `${date}T${clock}:00`) {
      return candidate.toISOString();
    }
    if (!renderedDate || !renderedClock) return undefined;
    const [renderedYear, renderedMonth, renderedDay] = renderedDate.split('-').map(Number);
    const [renderedHour, renderedMinute] = renderedClock.split(':').map(Number);
    if (
      renderedYear === undefined ||
      renderedMonth === undefined ||
      renderedDay === undefined ||
      renderedHour === undefined ||
      renderedMinute === undefined
    )
      return undefined;
    const rendered = Date.UTC(
      renderedYear,
      renderedMonth - 1,
      renderedDay,
      renderedHour,
      renderedMinute,
    );
    candidate = new Date(candidate.getTime() + target - rendered);
  }
  return undefined;
};

export const tradingSessionStartAt = (calendar: TradingCalendar, date: string) => {
  const firstSession = calendar.sessionsForDate(`${date}T12:00:00Z`)[0];
  if (!firstSession) return undefined;
  const hours = Math.floor(firstSession.start / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (firstSession.start % 60).toString().padStart(2, '0');
  return localTimestamp(date, `${hours}:${minutes}`, calendar.timezone);
};

const clockSeconds = (value: string) => {
  const [hour, minute, second] = value.split(':').map(Number);
  if (
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    ![hour, minute, second].every(Number.isFinite)
  )
    return undefined;
  return hour * 3600 + minute * 60 + second;
};

export const expectedCutoffSchedule = (
  requestAt: string,
  calendar: TradingCalendar,
  cutoffLocalTime: string,
) => {
  const date = navLocalDate(requestAt, calendar.timezone);
  const clock = navLocalClock(requestAt, calendar.timezone);
  const cutoffSeconds = clockSeconds(`${cutoffLocalTime}:00`);
  const requestSeconds = clock === undefined ? undefined : clockSeconds(clock);
  if (
    !date ||
    requestSeconds === undefined ||
    cutoffSeconds === undefined ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoffLocalTime)
  )
    return undefined;
  const trading = calendar.isTradingDay(`${date}T12:00:00Z`);
  const beforeCutoff = !trading || requestSeconds <= cutoffSeconds;
  const cutoffDate = trading ? date : nextTradingDate(calendar, date);
  if (!cutoffDate) return undefined;
  const valuationDate = beforeCutoff
    ? cutoffDate
    : (nextTradingDate(calendar, cutoffDate) ?? cutoffDate);
  const cutoffAt = localTimestamp(cutoffDate, cutoffLocalTime, calendar.timezone);
  if (!cutoffAt || !valuationDate) return undefined;
  return { cutoffAt, valuationDate };
};

export const navEventTimeReason = (
  event: NavEventTime,
  evaluationAt: string,
  delayedCode: CnNavSimulationRejectCode = 'FUTURE_DATA',
) => {
  const occurred = navTime(event.occurredAt);
  const available = navTime(event.availableAt);
  const evaluation = navTime(evaluationAt);
  if (![occurred, available, evaluation].every(Number.isFinite)) {
    return { code: 'INVALID_TIME' as const, reason: 'NAV Simulation 时间无效' };
  }
  if (available < occurred) {
    return { code: 'INVALID_TIME' as const, reason: 'availableAt 不能早于 occurredAt' };
  }
  if (occurred > evaluation || available > evaluation) {
    return { code: delayedCode, reason: 'NAV Simulation 事件在评估时尚不可用' };
  }
  return undefined;
};
