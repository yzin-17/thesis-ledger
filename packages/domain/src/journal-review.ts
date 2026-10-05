import type {
  TradeLifecycle,
  TradeEndEvidence,
  TradeProjection,
  TradeCloseSlice,
} from './trade-projection.js';
import { DecimalValue } from './decimal.js';

export const JOURNAL_REVIEW_OBJECT_TYPES = ['TRADE_CYCLE', 'CLOSE_SLICE'] as const;
export type JournalReviewObjectType = (typeof JOURNAL_REVIEW_OBJECT_TYPES)[number];
export const JOURNAL_STATISTICS_EXCLUSION_REASONS = [
  'ACTIVE_TRADE',
  'NON_SELL_ENDING',
  'UNKNOWN_OPENED_AT',
  'ESTIMATED_COST',
  'COST_CONFLICT',
  'FX_MISSING',
  'EVIDENCE_INCOMPLETE',
  'STALE_PROJECTION',
  'LEGACY_UNCONFIRMED',
] as const;
export type JournalStatisticsExclusionReason =
  (typeof JOURNAL_STATISTICS_EXCLUSION_REASONS)[number];

export type JournalReviewObjectReference =
  | { reviewObjectType: 'TRADE_CYCLE'; reviewObjectId: string; tradeId: string }
  | {
      reviewObjectType: 'CLOSE_SLICE';
      reviewObjectId: string;
      tradeId: string;
      closeSliceId: string;
    };

export function journalReviewObjectId(type: JournalReviewObjectType, sourceId: string): string {
  if (!sourceId.trim()) throw new Error('复盘对象来源 ID 不能为空');
  return `${type}:${sourceId}`;
}

export function journalReviewObjectReference(
  trade: Pick<TradeProjection, 'id'> & { closeSlices: readonly Pick<TradeCloseSlice, 'id'>[] },
  closeSliceId?: string,
): JournalReviewObjectReference {
  if (closeSliceId !== undefined) {
    if (!trade.closeSlices.some((slice) => slice.id === closeSliceId))
      throw new Error('减仓片段不属于指定交易周期');
    return {
      reviewObjectType: 'CLOSE_SLICE',
      reviewObjectId: journalReviewObjectId('CLOSE_SLICE', closeSliceId),
      tradeId: trade.id,
      closeSliceId,
    };
  }
  return {
    reviewObjectType: 'TRADE_CYCLE',
    reviewObjectId: journalReviewObjectId('TRADE_CYCLE', trade.id),
    tradeId: trade.id,
  };
}

export function journalReviewObjectTimes(
  trade: Pick<TradeProjection, 'id' | 'lifecycle' | 'openedAt' | 'closedAt'> & {
    closeSlices: readonly Pick<TradeCloseSlice, 'id' | 'occurredAt'>[];
  },
  reference: JournalReviewObjectReference,
): { openedAt: string | null; effectiveClosedAt: string | null; executedAt: string | null } {
  if (reference.tradeId !== trade.id) throw new Error('复盘对象不属于指定交易周期');
  if (reference.reviewObjectType === 'CLOSE_SLICE') {
    const slice = trade.closeSlices.find((item) => item.id === reference.closeSliceId);
    if (!slice) throw new Error('减仓片段不属于指定交易周期');
    return { openedAt: trade.openedAt, effectiveClosedAt: null, executedAt: slice.occurredAt };
  }
  return {
    openedAt: trade.openedAt,
    effectiveClosedAt: trade.lifecycle === 'ENDED' ? trade.closedAt : null,
    executedAt: null,
  };
}

export interface JournalStatisticsFacts {
  reviewObjectType: JournalReviewObjectType;
  lifecycle: TradeLifecycle;
  endEvidence: TradeEndEvidence;
  openedAt: string | null;
  statisticsAt: string | null;
  costEstimated: boolean;
  costConflict: boolean;
  fxMissing: boolean;
  evidenceComplete: boolean;
  stale: boolean;
  legacyUnconfirmed: boolean;
}

export function journalStatisticsEligibility(facts: JournalStatisticsFacts): {
  eligible: boolean;
  reasons: JournalStatisticsExclusionReason[];
} {
  const reasons: JournalStatisticsExclusionReason[] = [];
  if (facts.reviewObjectType === 'TRADE_CYCLE') {
    if (facts.lifecycle === 'ACTIVE') reasons.push('ACTIVE_TRADE');
    if (facts.endEvidence !== 'SELL_EXECUTION') reasons.push('NON_SELL_ENDING');
    if (facts.openedAt === null) reasons.push('UNKNOWN_OPENED_AT');
  }
  if (facts.costEstimated) reasons.push('ESTIMATED_COST');
  if (facts.costConflict) reasons.push('COST_CONFLICT');
  if (facts.fxMissing) reasons.push('FX_MISSING');
  if (
    !facts.evidenceComplete ||
    facts.statisticsAt === null ||
    !reviewTimesOrdered(facts.openedAt, facts.statisticsAt)
  )
    reasons.push('EVIDENCE_INCOMPLETE');
  if (facts.stale) reasons.push('STALE_PROJECTION');
  if (facts.legacyUnconfirmed) reasons.push('LEGACY_UNCONFIRMED');
  return { eligible: reasons.length === 0, reasons };
}

function reviewTimesOrdered(openedAt: string | null, statisticsAt: string | null) {
  if (openedAt === null || statisticsAt === null) return true;
  return reviewTimestamp(statisticsAt).compareTo(reviewTimestamp(openedAt)) >= 0;
}

export interface JournalReviewWindow {
  start: string | null;
  end: string | null;
  startEpochSeconds: string | null;
  endEpochSeconds: string | null;
}

function reviewTimestamp(value: string): DecimalValue {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?:\.(\d+))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value,
    );
  const timestamp = match
    ? Date.parse(`${match[1]}-${match[2]}-${match[3]}${match[4]}${match[6]}`)
    : NaN;
  if (!match || !Number.isFinite(timestamp)) throw new Error('复盘窗口时间必须为带时区的 ISO 时间');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]!)
    throw new Error('复盘窗口时间日期无效');
  return DecimalValue.from(String(timestamp / 1000)).plus(`0.${match[5] ?? '0'}`);
}

export function journalReviewWindow(input: { start?: string; end?: string }): JournalReviewWindow {
  const start = input.start === undefined ? null : reviewTimestamp(input.start);
  const end = input.end === undefined ? null : reviewTimestamp(input.end);
  if (start !== null && end !== null && start.compareTo(end) > 0)
    throw new Error('结束时间不能早于开始时间');
  return {
    start: input.start ?? null,
    end: input.end ?? null,
    startEpochSeconds: start?.toString() ?? null,
    endEpochSeconds: end?.toString() ?? null,
  };
}

export function journalReviewFallsInWindow(
  at: string | null,
  window: JournalReviewWindow,
): boolean {
  if (window.startEpochSeconds === null && window.endEpochSeconds === null) return true;
  if (at === null) return false;
  const timestamp = reviewTimestamp(at);
  if (window.startEpochSeconds !== null && timestamp.compareTo(window.startEpochSeconds) < 0)
    return false;
  if (window.endEpochSeconds !== null && timestamp.compareTo(window.endEpochSeconds) >= 0)
    return false;
  return true;
}
