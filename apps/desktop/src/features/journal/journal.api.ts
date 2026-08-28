import { createAiRun } from '../ai/ai.api.js';
import {
  ThesisLedgerContractError,
  type JournalReviewCandidatesResponse,
  type JournalReviewSnapshotInput,
  type JournalReviewSnapshotResponse,
} from '@thesis-ledger/api-client';
import {
  journalReviewCandidatesResponseSchema,
  journalReviewSnapshotResponseSchema,
} from '@thesis-ledger/schemas';
import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type {
  BehaviorReviewResult,
  DeterministicJournalReviewResult,
  JournalReviewCandidate,
  JournalReviewResult,
  ReviewTrade,
  ReviewWindow,
} from './journal.types.js';

export interface ReviewCandidatesQuery {
  accountId: string;
  mode?: 'actual' | 'shadow';
  symbol?: string;
  start?: string;
  end?: string;
  cursor?: string;
  limit?: number;
}

export interface ReviewCandidatesResponse {
  items: JournalReviewCandidate[];
  total: number;
  nextCursor: string | null;
  legacyItems: JournalReviewCandidatesResponse['legacyItems'];
}

const noStore = { cache: 'no-store' as const };

const queryString = (params: ReviewCandidatesQuery) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
};

export const fetchReviewCandidates = async (
  params: ReviewCandidatesQuery,
  client?: DesktopRequestClient,
) => {
  const path = `/journal/review-candidates${queryString(params)}`;
  const raw = await requestDesktopJson<unknown>(path, noStore, client);
  const parsed = journalReviewCandidatesResponseSchema.safeParse(raw);
  if (!parsed.success) throw new ThesisLedgerContractError(path);
  return parsed.data;
};

export const saveReviewSnapshot = async (
  input: JournalReviewSnapshotInput,
  client?: DesktopRequestClient,
): Promise<JournalReviewSnapshotResponse> => {
  const path = '/journal/review-snapshots';
  const raw = await requestDesktopJson<unknown>(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );
  const parsed = journalReviewSnapshotResponseSchema.safeParse(raw);
  if (!parsed.success) throw new ThesisLedgerContractError(path);
  return parsed.data;
};

const requestAnalysis = (path: string, body: unknown, client?: DesktopRequestClient) =>
  requestDesktopJson<unknown>(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    client,
  );

const startAiExplanation = async (
  context: unknown,
  symbol?: string,
  client?: DesktopRequestClient,
) => {
  try {
    return await createAiRun(
      {
        provider: 'mock',
        model: 'behavior-review-default',
        promptVersion: 'journal-review-v1',
        context: { scope: symbol ? 'position' : 'portfolio', ...(symbol ? { symbol } : {}) },
        modelMetadata: { mode: 'deterministic-evidence-only', evidence: context },
      },
      client,
    );
  } catch {
    return null;
  }
};

export const analyzeSingleTrade = async (
  trade: ReviewTrade,
  client?: DesktopRequestClient,
): Promise<DeterministicJournalReviewResult> => {
  const [plannedVsActual, behavior, counterfactual] = await Promise.all([
    requestAnalysis('/journal/analysis/planned-vs-actual', trade, client),
    requestAnalysis('/journal/analysis/behavior', { trades: [trade] }, client),
    requestAnalysis(
      '/journal/analysis/counterfactual',
      {
        trades: [trade],
        enforceStop: trade.plannedStop !== undefined,
        ...(trade.plannedStop === undefined ? {} : { stopPrice: trade.plannedStop }),
      },
      client,
    ),
  ]);
  return { plannedVsActual, behavior, counterfactual };
};

export const analyzeBehavior = async (
  trades: ReviewTrade[],
  window?: ReviewWindow,
  client?: DesktopRequestClient,
): Promise<Omit<BehaviorReviewResult, 'aiRun'>> => {
  const start =
    window?.start ?? trades.map((trade) => trade.entryAt).sort()[0] ?? new Date().toISOString();
  const end =
    window?.end ??
    trades
      .map((trade) => trade.exitAt)
      .sort()
      .at(-1) ??
    new Date().toISOString();
  const [metrics, review] = await Promise.all([
    requestAnalysis('/journal/analysis/behavior', { trades }, client),
    requestAnalysis('/journal/analysis/review', { trades, start, end }, client),
  ]);
  return { metrics, window: review };
};

export const explainSingleTrade = (
  trade: ReviewTrade,
  result: DeterministicJournalReviewResult,
  client?: DesktopRequestClient,
  sources?: JournalReviewCandidate['sources'],
) =>
  createAiRun(
    {
      provider: 'mock',
      model: 'behavior-review-default',
      promptVersion: 'journal-review-v1',
      context: { scope: 'position', symbol: trade.symbol },
      modelMetadata: {
        mode: 'deterministic-evidence-only',
        evidence: {
          kind: 'single-trade-review',
          trade,
          ...result,
          ...(sources ? { sources } : {}),
        },
      },
    },
    client,
  );

export const explainBehavior = (
  trades: ReviewTrade[],
  result: Omit<BehaviorReviewResult, 'aiRun'>,
  window: ReviewWindow,
  client?: DesktopRequestClient,
  sources?: JournalReviewCandidate['sources'][],
) =>
  createAiRun(
    {
      provider: 'mock',
      model: 'behavior-review-default',
      promptVersion: 'journal-review-v1',
      context: { scope: 'portfolio' },
      modelMetadata: {
        mode: 'deterministic-evidence-only',
        evidence: {
          kind: 'behavior-review',
          trades,
          selectedWindow: window,
          metrics: result.metrics,
          review: result.window,
          ...(sources ? { sources } : {}),
        },
      },
    },
    client,
  );

export const reviewSingleTrade = async (
  trade: ReviewTrade,
  client?: DesktopRequestClient,
): Promise<JournalReviewResult> => {
  const result = await analyzeSingleTrade(trade, client);
  let aiRun = null;
  try {
    aiRun = await startAiExplanation(
      { kind: 'single-trade-review', trade, ...result },
      trade.symbol,
      client,
    );
  } catch {
    aiRun = null;
  }
  return { ...result, aiRun };
};

export const reviewBehavior = async (
  trades: ReviewTrade[],
  client?: DesktopRequestClient,
): Promise<BehaviorReviewResult> => {
  const result = await analyzeBehavior(trades, undefined, client);
  let aiRun = null;
  try {
    aiRun = await startAiExplanation(
      {
        kind: 'behavior-review',
        selectedWindow: {
          start: trades.map((trade) => trade.entryAt).sort()[0] ?? new Date().toISOString(),
          end:
            trades
              .map((trade) => trade.exitAt)
              .sort()
              .at(-1) ?? new Date().toISOString(),
        },
        metrics: result.metrics,
        review: result.window,
      },
      undefined,
      client,
    );
  } catch {
    aiRun = null;
  }
  return { ...result, aiRun };
};
