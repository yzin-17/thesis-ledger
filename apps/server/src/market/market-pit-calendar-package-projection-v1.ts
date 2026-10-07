import { createHash } from 'node:crypto';
import type { HistoricalDecisionWindowV3 } from '@thesis-ledger/schemas';
import type { XshgPackageSourceV1 } from './market-pit-calendar-package-source-v1.js';

type Calendar = HistoricalDecisionWindowV3['calendars'][number];
export const XSHG_PACKAGE_NORMALIZATION_V1 = 'exchange-calendars-4.13.2-xshg-projection-v1';
export const XSHG_PACKAGE_TIMEZONE_RULES_V1 = 'Asia/Shanghai-2026-fixed-UTC+08-v1';
const hashArray = (value: unknown[]) =>
  createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

/** UTC 秒与小数分开处理，最多六位微秒；不截断发布边界。 */
export function calendarPackageInstantMicrosV1(value: string): bigint {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new Error('publication-time');
  const [, date, hour, minute, second, fraction, zone] = match;
  if (
    new Date(date!).toISOString().slice(0, 10) !== date ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  )
    throw new Error('publication-time');
  if (zone !== 'Z' && (Number(zone!.slice(1, 3)) > 23 || Number(zone!.slice(4)) > 59))
    throw new Error('publication-time');
  const seconds = Date.parse(`${date}T${hour}:${minute}:${second}${zone}`);
  if (!Number.isFinite(seconds)) throw new Error('publication-time');
  return BigInt(seconds) * 1_000n + BigInt((fraction ?? '').padEnd(6, '0'));
}

/** 固定顺序数组；所有逐日发布引用和时段文本均参与摘要。 */
export function xshgPackageProjectionHashV1(calendar: Calendar): string {
  return hashArray([
    XSHG_PACKAGE_NORMALIZATION_V1,
    calendar.market,
    calendar.exchange,
    calendar.timezone,
    calendar.timezoneRulesIdentity,
    [calendar.historicalRange.start, calendar.historicalRange.end],
    calendar.publicationIds,
    calendar.dateStates.map((state) => [
      state.date,
      state.status,
      state.reason,
      state.publicationIds,
      state.sessions.map((session) => [
        session.startMinute,
        session.endMinute,
        session.openedAt,
        session.closedAt,
      ]),
    ]),
  ]);
}

export function xshgPackageCalendarContentHashV1(input: {
  parserVersion: string;
  rawSha256: string;
  artifactSha256: string;
  sourceTreeHash: string;
  calendar: Calendar;
}): string {
  return hashArray([
    'exchange-calendars-4.13.2-xshg-content-v1',
    input.parserVersion,
    input.rawSha256,
    input.artifactSha256,
    input.sourceTreeHash,
    [input.calendar.historicalRange.start, input.calendar.historicalRange.end],
    input.calendar.projectionHash,
  ]);
}

function assertXshgProjectionScope(calendar: Calendar, source: XshgPackageSourceV1): void {
  const { start, end } = calendar.historicalRange;
  if (
    calendar.market !== 'CN' ||
    calendar.exchange !== 'XSHG' ||
    calendar.timezone !== 'Asia/Shanghai' ||
    calendar.normalizationVersion !== XSHG_PACKAGE_NORMALIZATION_V1 ||
    calendar.timezoneRulesIdentity !== XSHG_PACKAGE_TIMEZONE_RULES_V1 ||
    !/^2026-\d{2}-\d{2}$/.test(start) ||
    !/^2026-\d{2}-\d{2}$/.test(end) ||
    start < '2026-03-10' ||
    end > '2026-12-31' ||
    end < start ||
    new Date(start).toISOString().slice(0, 10) !== start ||
    new Date(end).toISOString().slice(0, 10) !== end ||
    source.minutes.join(',') !== '570,690,780,900'
  )
    throw new Error('calendar-scope');
}

/** 只复算登记范围的常规日内双时段，不证明标的场所资格。 */
export function recomputeXshgPackageProjectionV1(
  calendar: Calendar,
  source: XshgPackageSourceV1,
  publicationId: string,
): Calendar {
  assertXshgProjectionScope(calendar, source);
  const { start, end } = calendar.historicalRange;
  const holidays = new Set(source.holidays);
  const dateStates: Calendar['dateStates'] = [];
  for (let day = Date.parse(start); day <= Date.parse(end); day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    const weekday = new Date(day).getUTCDay();
    let reason: Calendar['dateStates'][number]['reason'] = 'regular';
    if (weekday === 0 || weekday === 6) reason = 'weekend';
    else if (holidays.has(date)) reason = 'exchange-holiday';
    const sessions: Calendar['dateStates'][number]['sessions'] = [];
    if (reason === 'regular')
      for (const [open, close] of [
        [570, 690],
        [780, 900],
      ]) {
        sessions.push({
          startMinute: open!,
          endMinute: close!,
          openedAt: new Date(day + (open! - 480) * 60_000).toISOString(),
          closedAt: new Date(day + (close! - 480) * 60_000).toISOString(),
        });
      }
    dateStates.push({
      date,
      status: sessions.length ? 'open' : 'closed',
      reason,
      publicationIds: [publicationId],
      sessions,
    });
  }
  const recomputed: Calendar = { ...calendar, publicationIds: [publicationId], dateStates };
  recomputed.projectionHash = xshgPackageProjectionHashV1(recomputed);
  return recomputed;
}
