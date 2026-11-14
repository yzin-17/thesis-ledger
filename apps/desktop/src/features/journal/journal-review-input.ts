import type {
  JournalReviewCandidate,
  ReviewEvidenceDraft,
  ReviewTrade,
  ReviewWindow,
  ReviewWindowPreset,
} from './journal.types.js';

const optionalTradeKeys: Array<keyof ReviewTrade> = [
  'plannedStop',
  'actualExit',
  'plannedHoldingDays',
  'entryPrice',
  'exitPrice',
  'plannedEntry',
  'plannedExit',
  'turnover',
  'peakWeight',
  'targetWeight',
  'quantity',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const toReviewTrade = (
  candidate: JournalReviewCandidate,
  evidence: ReviewEvidenceDraft = {},
): ReviewTrade | null => {
  if (candidate.pnl === null) return null;
  const trade: ReviewTrade = {
    symbol: candidate.symbol,
    entryAt: candidate.entryAt,
    exitAt: candidate.exitAt,
    pnl: candidate.pnl,
  };
  for (const key of optionalTradeKeys) {
    const candidateValue = candidate[key];
    const evidenceValue = evidence[key as keyof ReviewEvidenceDraft];
    const value = evidenceValue ?? candidateValue;
    if (value !== undefined) trade[key] = value as never;
  }
  return trade;
};

export const parseTrade = (value: unknown): ReviewTrade | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.symbol !== 'string' ||
    value.symbol.trim().length === 0 ||
    typeof value.entryAt !== 'string' ||
    typeof value.exitAt !== 'string' ||
    !isFiniteNumber(value.pnl)
  ) {
    return null;
  }
  if (
    Number.isNaN(new Date(value.entryAt).getTime()) ||
    Number.isNaN(new Date(value.exitAt).getTime())
  ) {
    return null;
  }
  const trade: ReviewTrade = {
    symbol: value.symbol,
    entryAt: value.entryAt,
    exitAt: value.exitAt,
    pnl: value.pnl,
  };
  for (const key of optionalTradeKeys) {
    if (isFiniteNumber(value[key])) trade[key] = value[key] as never;
  }
  return trade;
};

export const parseTrades = (value: unknown): ReviewTrade[] | null => {
  if (!Array.isArray(value)) return null;
  const trades = value.map(parseTrade);
  return trades.every((trade): trade is ReviewTrade => trade !== null) && trades.length > 0
    ? trades
    : null;
};

export const latestWindow = (preset: Exclude<ReviewWindowPreset, 'custom'>): ReviewWindow => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (preset === '7d' ? 7 : 30));
  return { start: start.toISOString(), end: end.toISOString() };
};

export const toLocalDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16);
};

export const fromLocalDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;
