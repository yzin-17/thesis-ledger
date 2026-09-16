import type { BarSeriesV2 } from '@thesis-ledger/schemas';
import { cnTradingCalendar } from '@thesis-ledger/domain';

const FIVE_MINUTES = 5 * 60_000;
const FIFTEEN_MINUTES = 15 * 60_000;
const SEVEN_DAYS = 7 * 86_400_000;
const THIRTY_DAYS = 30 * 86_400_000;

export const nextCnMarketOpen = (value: Date): Date | null => {
  const cursor = new Date(value);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  cursor.setUTCHours(1, 30, 0, 0); // 09:30 Asia/Shanghai
  for (let attempts = 0; attempts < 370; attempts += 1) {
    const status = cnTradingCalendar.status(cursor);
    if (status.reason === 'calendar-unavailable') return null;
    if (status.open) return cursor;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return null;
};

const localDate = (value: Date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const localMinutes = (value: Date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return Number(parts.hour) * 60 + Number(parts.minute);
};

const currentTailFreshness = (now: Date) => {
  const day = cnTradingCalendar.status(now);
  if (!day.open) return null;
  const sessions = cnTradingCalendar.sessionsForDate(now);
  const lastSession = sessions.at(-1);
  if (!lastSession) return null;
  return localMinutes(now) < lastSession.end ? FIVE_MINUTES : FIFTEEN_MINUTES;
};

const isRecentTradingSession = (latest: Date, now: Date) => {
  const latestDate = localDate(latest);
  const cursor = new Date(now);
  const today = cnTradingCalendar.status(now);
  const beforeOpen = today.open && localMinutes(now) < (cnTradingCalendar.sessionsForDate(now)[0]?.start ?? 570);
  for (let attempts = 0; attempts < 370; attempts += 1) {
    const status = cnTradingCalendar.status(cursor);
    if (status.reason === 'calendar-unavailable') return null;
    if (status.open && !(beforeOpen && status.date === today.date)) return status.date === latestDate;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return null;
};

export const resolveBarFreshUntil = (
  series: Pick<BarSeriesV2, 'identity' | 'points'>,
  now: Date,
  options: { windowEnd?: string } = {},
): Date => {
  const latest = series.points.at(-1);
  const historicalWindow = Boolean(
    options.windowEnd && localDate(new Date(options.windowEnd)) < localDate(now),
  );
  if (!latest || latest.completionStatus === 'unknown') {
    const currentTail = currentTailFreshness(now);
    if (currentTail !== null) return new Date(now.getTime() + currentTail);
    return new Date(now.getTime() + FIFTEEN_MINUTES);
  }
  if (latest.completionStatus === 'incomplete') {
    const currentTail = currentTailFreshness(now);
    return new Date(now.getTime() + (currentTail ?? FIFTEEN_MINUTES));
  }
  const recent = isRecentTradingSession(new Date(latest.timestamp), now);
  if (!historicalWindow && localDate(new Date(latest.timestamp)) !== localDate(now)) {
    const currentTail = currentTailFreshness(now);
    if (currentTail !== null) return new Date(now.getTime() + currentTail);
  }
  if (recent === true) return nextCnMarketOpen(new Date(latest.timestamp)) ?? new Date(now.getTime() + FIVE_MINUTES);
  if (recent === null) return new Date(now.getTime() + FIVE_MINUTES);
  return new Date(now.getTime() + (series.identity.adjustment === 'none' ? THIRTY_DAYS : SEVEN_DAYS));
};

export const isFresh = (freshUntil: string, now: Date) =>
  new Date(freshUntil).getTime() > now.getTime();
