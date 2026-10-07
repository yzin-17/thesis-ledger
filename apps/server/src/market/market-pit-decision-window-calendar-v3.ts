import { isDeepStrictEqual } from 'node:util';
import type { HistoricalDecisionWindowV3 } from '@thesis-ledger/schemas';
import type { CalendarPackageParseResultV1 } from './market-pit-calendar-package-v1.js';
import {
  compareMarketPitEvidenceInstantsV1,
  parseMarketPitEvidenceInstantV1,
} from './market-pit-evidence-instant-v1.js';

type Calendar = HistoricalDecisionWindowV3['calendars'][number];
export type MarketPitVerifiedCalendarV3 = Extract<
  CalendarPackageParseResultV1,
  { status: 'calendar-package-verified' }
>;
export type MarketPitDailyWindowV3 = {
  closedAt: string;
  nextTradingDate: string;
  nextOpenedAt: string;
};
export type MarketPitCalendarIndexV3 = {
  calendar: Calendar;
  windows: Map<string, MarketPitDailyWindowV3>;
};

/** 仅比较协议瞬时；全部小数位保留，不使用毫秒时钟。 */
export function compareDecisionClockV3(left: string, right: string): number {
  return compareMarketPitEvidenceInstantsV1(
    parseMarketPitEvidenceInstantV1(left),
    parseMarketPitEvidenceInstantV1(right),
  );
}

const shanghaiDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 与 BarSeries V3 一致，交易日取市场当地日期而非时间文本中的日期。 */
export function marketPitShanghaiTradingDateV3(timestamp: string): string {
  const instant = parseMarketPitEvidenceInstantV1(timestamp);
  const parts = new Map(
    shanghaiDateFormatter
      .formatToParts(new Date(Number(instant.seconds) * 1_000))
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`;
}

function dateSeconds(date: string): bigint {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('calendar-range-incomplete');
  return parseMarketPitEvidenceInstantV1(`${date}T00:00:00Z`).seconds;
}

function assertSessionDay(state: Calendar['dateStates'][number]): void {
  const date = state.date;
  let previousMinute = -1;
  let previousClose: string | undefined;
  const midnight = dateSeconds(date);
  for (const session of state.sessions) {
    if (
      !Number.isInteger(session.startMinute) ||
      !Number.isInteger(session.endMinute) ||
      session.startMinute < 0 ||
      session.endMinute >= 1440 ||
      session.startMinute >= session.endMinute ||
      session.startMinute <= previousMinute
    )
      throw new Error('calendar-session-invalid');
    for (const [value, minute] of [
      [session.openedAt, session.startMinute],
      [session.closedAt, session.endMinute],
    ] as const) {
      const instant = parseMarketPitEvidenceInstantV1(value);
      if (instant.fraction || instant.seconds !== midnight + BigInt(minute - 480) * 60n)
        throw new Error('calendar-session-invalid');
    }
    if (previousClose && compareDecisionClockV3(previousClose, session.openedAt) >= 0)
      throw new Error('calendar-session-invalid');
    previousMinute = session.endMinute;
    previousClose = session.closedAt;
  }
}

function indexCalendar(calendar: Calendar): MarketPitCalendarIndexV3 {
  // 首批仅消费登记 parser 的固定 UTC+08 日内模型；其他时区须独立扩展。
  if (calendar.timezone !== 'Asia/Shanghai') throw new Error('calendar-model-unsupported');
  const start = dateSeconds(calendar.historicalRange.start);
  const end = dateSeconds(calendar.historicalRange.end);
  if (end < start || calendar.dateStates.length !== Number((end - start) / 86_400n) + 1)
    throw new Error('calendar-range-incomplete');
  for (const [index, state] of calendar.dateStates.entries()) {
    if (dateSeconds(state.date) !== start + BigInt(index) * 86_400n)
      throw new Error('calendar-range-incomplete');
    if ((state.status === 'open') !== state.sessions.length > 0)
      throw new Error('calendar-session-invalid');
    assertSessionDay(state);
  }
  const windows = new Map<string, MarketPitDailyWindowV3>();
  let successor: { date: string; openedAt: string } | undefined;
  for (let index = calendar.dateStates.length - 1; index >= 0; index -= 1) {
    const state = calendar.dateStates[index]!;
    if (state.status !== 'open') continue;
    if (successor)
      windows.set(state.date, {
        closedAt: state.sessions.at(-1)!.closedAt,
        nextTradingDate: successor.date,
        nextOpenedAt: successor.openedAt,
      });
    successor = { date: state.date, openedAt: state.sessions[0]!.openedAt };
  }
  return { calendar, windows };
}

/** 成功标记只代表上游必要计算；本层不签发原文或交易所归属资格。 */
export function indexMarketPitDecisionCalendarsV3(
  declared: readonly Calendar[],
  verified: readonly MarketPitVerifiedCalendarV3[],
  symbol: string,
  market: string,
): Map<string, MarketPitCalendarIndexV3> {
  if (verified.length !== declared.length) throw new Error('calendar-binding-mismatch');
  const results = new Map<string, MarketPitCalendarIndexV3>();
  const contentHashes = new Set<string>();
  const projectionHashes = new Set<string>();
  for (const result of verified) {
    const calendar = result.calendar;
    const original = declared.filter((item) => item.id === calendar.id);
    if (
      result.status !== 'calendar-package-verified' ||
      results.has(calendar.id) ||
      contentHashes.has(calendar.calendarContentHash) ||
      projectionHashes.has(calendar.projectionHash) ||
      original.length !== 1 ||
      !isDeepStrictEqual(calendar, original[0]) ||
      result.knownAvailableAt !== calendar.knownAvailableAt
    )
      throw new Error('calendar-binding-mismatch');
    if (calendar.market !== market || !calendar.symbolScope.includes(symbol))
      throw new Error('calendar-scope-mismatch');
    results.set(calendar.id, indexCalendar(calendar));
    contentHashes.add(calendar.calendarContentHash);
    projectionHashes.add(calendar.projectionHash);
  }
  return results;
}
