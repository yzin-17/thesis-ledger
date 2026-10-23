import { Prisma } from '@prisma/client';
import {
  compareMarketPitEvidenceInstantStringsV1 as compareEvidenceInstants,
  marketPeriodCalendarSchema,
  researchObservationEvaluationSchema,
  type ResearchGenerationV2,
  type ResearchObservationEvaluation,
} from '@thesis-ledger/schemas';
import type { MarketPeriodCalendarFact } from '@thesis-ledger/domain';

export type ObservationClaim = ResearchGenerationV2['claims'][number];
export type ObservationReason = ResearchObservationEvaluation['reasons'][number];
export type ObservationCalendar =
  | { status: 'ready'; calendar: MarketPeriodCalendarFact }
  | { status: 'unavailable'; reason: ObservationReason };
export type ObservationPrices =
  | {
      status: 'ready';
      currency: string;
      fingerprint: string;
      points: Array<{
        date: string;
        close: string;
        availableAt: string;
        state: 'traded' | 'unknown' | 'suspended';
      }>;
    }
  | { status: 'unavailable'; reason: ObservationReason };
const timezones = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' } as const;
export function observationEvidenceVisibleAt(instant: string, cutoff: string) {
  const order = compareEvidenceInstants(instant, cutoff);
  return order !== undefined && order <= 0;
}
export function observationMarketDate(instant: string, timezone: string) {
  const fields = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => fields.find((field) => field.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function empty(
  claim: ObservationClaim,
  status: ResearchObservationEvaluation['status'],
  reason: ObservationReason,
) {
  let tradingDays: 5 | 20 | null = null;
  if (claim.kind === 'price-direction') tradingDays = claim.tradingDays;
  return researchObservationEvaluationSchema.parse({
    status,
    reasons: [reason],
    window: {
      tradingDays,
      startSession: null,
      endSession: null,
      startCloseAt: null,
      endCloseAt: null,
    },
    economic: {
      basis: 'economic-close',
      currency: null,
      startPrice: null,
      endPrice: null,
      returnRate: null,
      directionMatched: null,
    },
  });
}

/** 合并同交易日的午间分段；第零日使用该日最后一个计划 Session 的收盘。 */
export function selectObservationWindow(input: {
  claim: ObservationClaim;
  createdAt: string;
  asOf: string;
  market: keyof typeof timezones;
  calendar: ObservationCalendar;
}) {
  const { claim, calendar } = input;
  if (claim.kind !== 'price-direction') return empty(claim, 'not_applicable', 'unsupported_claim');
  if (calendar.status !== 'ready') return empty(claim, 'insufficient_data', calendar.reason);
  const parsed = marketPeriodCalendarSchema.safeParse(calendar.calendar);
  if (!parsed.success) return empty(claim, 'insufficient_data', 'calendar_unqualified');
  const fact = parsed.data;
  const createdOrder = compareEvidenceInstants(input.createdAt, input.asOf);
  if (createdOrder === undefined || createdOrder > 0)
    return empty(claim, 'insufficient_data', 'calendar_unqualified');
  const day = observationMarketDate(input.createdAt, timezones[input.market]);
  if (
    fact.market !== input.market ||
    fact.timezone !== timezones[input.market] ||
    !observationEvidenceVisibleAt(fact.availableAt, input.asOf) ||
    fact.coverageStart > day
  )
    return empty(claim, 'insufficient_data', 'calendar_unqualified');
  const byDate = new Map<string, { date: string; closeAt: string }>();
  for (const session of fact.sessions) {
    if (
      compareEvidenceInstants(session.endAt, session.endAt) === undefined ||
      observationMarketDate(session.endAt, fact.timezone) !== session.tradingDate
    )
      return empty(claim, 'insufficient_data', 'calendar_unqualified');
    const prior = byDate.get(session.tradingDate);
    if (!prior || compareEvidenceInstants(prior.closeAt, session.endAt) === -1)
      byDate.set(session.tradingDate, { date: session.tradingDate, closeAt: session.endAt });
  }
  const sessions = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const index = sessions.findIndex(
    (session) => compareEvidenceInstants(session.closeAt, input.createdAt) === 1,
  );
  const start = sessions[index],
    end = sessions[index + claim.tradingDays];
  if (index < 0 || !start || !end || end.date > fact.coverageEnd)
    return empty(claim, 'insufficient_data', 'calendar_incomplete');
  const result = empty(claim, 'not_due', 'not_due');
  result.window = {
    tradingDays: claim.tradingDays,
    startSession: start.date,
    endSession: end.date,
    startCloseAt: start.closeAt,
    endCloseAt: end.closeAt,
  };
  if (compareEvidenceInstants(end.closeAt, input.asOf) !== 1) {
    result.status = 'insufficient_data';
    result.reasons = ['price_unavailable'];
  }
  return result;
}

/** 仅消费固定两端，不跳过停牌/缺价日期，不回退当前报价。 */
export function evaluateObservationPrices(
  window: ResearchObservationEvaluation,
  claim: ObservationClaim,
  asOf: string,
  prices: ObservationPrices,
): ResearchObservationEvaluation {
  const result = structuredClone(window);
  if (
    result.status !== 'insufficient_data' ||
    result.reasons[0] !== 'price_unavailable' ||
    claim.kind !== 'price-direction'
  )
    return result;
  if (prices.status !== 'ready') {
    result.reasons = [prices.reason];
    return result;
  }
  const starts = prices.points.filter((point) => point.date === result.window.startSession);
  const ends = prices.points.filter((point) => point.date === result.window.endSession);
  const left = starts[0],
    right = ends[0];
  if (starts.length !== 1 || ends.length !== 1 || !left || !right) {
    result.reasons = ['price_missing'];
    return result;
  }
  const endpoints = [left, right];
  if (endpoints.some((point) => point.state === 'suspended')) {
    result.reasons = ['suspended'];
    return result;
  }
  if (
    endpoints.some(
      (point) => point.state !== 'traded' || !observationEvidenceVisibleAt(point.availableAt, asOf),
    )
  ) {
    result.reasons = ['coverage_incomplete'];
    return result;
  }
  let startPrice: Prisma.Decimal, endPrice: Prisma.Decimal;
  try {
    startPrice = new Prisma.Decimal(left.close);
    endPrice = new Prisma.Decimal(right.close);
  } catch {
    result.reasons = ['price_missing'];
    return result;
  }
  if (!startPrice.isFinite() || !endPrice.isFinite() || startPrice.lte(0) || endPrice.lte(0)) {
    result.reasons = ['price_missing'];
    return result;
  }
  const rate = endPrice.div(startPrice).minus(1);
  let directionMatched = rate.gt(0);
  if (claim.direction === 'down') directionMatched = rate.lt(0);
  return researchObservationEvaluationSchema.parse({
    ...result,
    status: 'completed',
    reasons: [],
    economic: {
      basis: 'economic-close',
      currency: prices.currency,
      startPrice: startPrice.toFixed(),
      endPrice: endPrice.toFixed(),
      returnRate: rate.toFixed(),
      directionMatched,
    },
  });
}
