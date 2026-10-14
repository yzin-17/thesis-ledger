import { createHash } from 'node:crypto';
import { tradingCalendarFromFact, type MarketPeriodCalendarFact } from '@thesis-ledger/domain';
import {
  backtestCalendarResponseSchema,
  marketPeriodCalendarSchema,
  type BacktestCalendarResponse,
} from '@thesis-ledger/schemas';
import {
  compareMarketPitEvidenceInstantsV1,
  parseMarketPitEvidenceInstantV1,
} from './market-pit-evidence-instant-v1.js';

export interface MarketPeriodCalendarRequest {
  market: 'CN';
  start: string;
  end: string;
  evaluationAsOf: string;
}
export type MarketPeriodCalendarResult =
  | { status: 'ready'; calendar: MarketPeriodCalendarFact }
  | {
      status: 'unavailable';
      reason:
        | 'calendar_unavailable'
        | 'calendar_incomplete'
        | 'calendar_invalid'
        | 'calendar_future'
        | 'calendar_model_unsupported';
    };
type Fact = BacktestCalendarResponse['facts'][number];
const DAY = 86_400_000;
const MAX_CALENDAR_DAYS = 20000;

function dateMillis(value: string): number {
  const milliseconds = Date.parse(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString().slice(0, 10) !== value
  )
    throw new Error('日历日期无效');
  return milliseconds;
}

export function validatePeriodCalendarRequest(input: MarketPeriodCalendarRequest): void {
  const start = dateMillis(input.start);
  const end = dateMillis(input.end);
  const instant = parseMarketPitEvidenceInstantV1(input.evaluationAsOf);
  const evaluationDay = Math.floor((Number(instant.seconds) * 1000) / DAY) * DAY;
  if (
    input.market !== 'CN' ||
    end < start ||
    (end - start) / DAY + 1 > MAX_CALENDAR_DAYS ||
    start > evaluationDay ||
    end > evaluationDay + 366 * DAY
  )
    throw new Error('日历请求范围或市场无效');
}

function validateSessions(sessions: Fact['sessions']): void {
  let previousEnd = -1;
  for (const session of sessions) {
    if (session.startMinute >= session.endMinute || session.startMinute < previousEnd)
      throw new Error('日历 Session 倒序或重叠');
    previousEnd = session.endMinute;
  }
}

function validateFact(fact: Fact): void {
  validateSessions(fact.sessions);
  const holidays = new Set<string>();
  const overrides = new Set<string>();
  for (const date of fact.holidays) {
    dateMillis(date);
    if (holidays.has(date) || date < fact.range.start! || date > fact.range.end!)
      throw new Error('日历假日重复或超出事实范围');
    holidays.add(date);
  }
  for (const override of fact.sessionOverrides) {
    const weekday = new Date(dateMillis(override.date)).getUTCDay();
    if (
      overrides.has(override.date) ||
      override.date < fact.range.start! ||
      override.date > fact.range.end!
    )
      throw new Error('日历覆盖重复或超出事实范围');
    if (override.sessions.length && (weekday === 0 || weekday === 6 || holidays.has(override.date)))
      throw new Error('当前日历模型不支持闭市日开市覆盖');
    overrides.add(override.date);
    validateSessions(override.sessions);
  }
}

function calendarRevision(response: BacktestCalendarResponse, fact: Fact): string {
  const encoding = JSON.stringify([
    'market-period-calendar-v1',
    response.provider,
    response.providerRevision,
    fact.market,
    fact.timezone,
    fact.availableAt,
    fact.range.start,
    fact.range.end,
    fact.holidays,
    fact.sessions.map((s) => [s.startMinute, s.endMinute]),
    fact.sessionOverrides.map((s) => [s.date, s.sessions.map((w) => [w.startMinute, w.endMinute])]),
  ]);
  return `market-period-calendar-v1:${createHash('sha256').update(encoding).digest('hex')}`;
}

function projectSessions(
  fact: Fact,
  input: MarketPeriodCalendarRequest,
): MarketPeriodCalendarFact['sessions'] {
  const calendar = tradingCalendarFromFact(fact);
  const result: Array<MarketPeriodCalendarFact['sessions'][number]> = [];
  for (let day = dateMillis(input.start); day <= dateMillis(input.end); day += DAY) {
    const tradingDate = new Date(day).toISOString().slice(0, 10);
    const probe = new Date(day + 4 * 60 * 60 * 1000);
    for (const session of calendar.sessionsForDate(probe)) {
      result.push({
        tradingDate,
        startAt: new Date(day + (session.start - 480) * 60_000).toISOString(),
        endAt: new Date(day + (session.end - 480) * 60_000).toISOString(),
      });
    }
  }
  return result;
}

/** 只投影已声明完整的 DSA 日历事实；不会提升为严格 PIT 或来源准入。 */
export function projectPeriodCalendar(
  responseInput: unknown,
  input: MarketPeriodCalendarRequest,
): MarketPeriodCalendarResult {
  try {
    validatePeriodCalendarRequest(input);
    const response = backtestCalendarResponseSchema.parse(responseInput);
    if (response.status !== 'supported')
      return { status: 'unavailable', reason: 'calendar_unavailable' };
    if (
      !response.coverage.complete ||
      !response.coverage.start ||
      !response.coverage.end ||
      response.coverage.start > input.start ||
      response.coverage.end < input.end
    )
      return { status: 'unavailable', reason: 'calendar_incomplete' };
    const fact = response.facts[0];
    if (
      response.facts.length !== 1 ||
      !fact ||
      fact.provider !== response.provider ||
      fact.providerRevision !== response.providerRevision
    )
      return { status: 'unavailable', reason: 'calendar_invalid' };
    if (fact.market !== input.market || fact.timezone !== 'Asia/Shanghai')
      return { status: 'unavailable', reason: 'calendar_model_unsupported' };
    if (
      !fact.range.start ||
      !fact.range.end ||
      fact.range.start > input.start ||
      fact.range.end < input.end
    )
      return { status: 'unavailable', reason: 'calendar_incomplete' };
    dateMillis(fact.range.start);
    dateMillis(fact.range.end);
    if (
      compareMarketPitEvidenceInstantsV1(
        parseMarketPitEvidenceInstantV1(fact.availableAt),
        parseMarketPitEvidenceInstantV1(input.evaluationAsOf),
      ) > 0
    )
      return { status: 'unavailable', reason: 'calendar_future' };
    validateFact(fact);
    const calendar = marketPeriodCalendarSchema.parse({
      market: fact.market,
      timezone: fact.timezone,
      revision: calendarRevision(response, fact),
      availableAt: fact.availableAt,
      coverageStart: input.start,
      coverageEnd: input.end,
      sessions: projectSessions(fact, input),
    });
    return { status: 'ready', calendar };
  } catch {
    return { status: 'unavailable', reason: 'calendar_invalid' };
  }
}
