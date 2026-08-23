import { createAiRun } from '../ai/ai.api.js';
import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type { BehaviorReviewResult, JournalReviewResult, ReviewTrade } from './journal.types.js';

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

export const reviewSingleTrade = async (
  trade: ReviewTrade,
  client?: DesktopRequestClient,
): Promise<JournalReviewResult> => {
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
  const aiRun = await startAiExplanation(
    { kind: 'single-trade-review', trade, plannedVsActual, behavior, counterfactual },
    trade.symbol,
    client,
  );
  return { plannedVsActual, behavior, counterfactual, aiRun };
};

export const reviewBehavior = async (
  trades: ReviewTrade[],
  client?: DesktopRequestClient,
): Promise<BehaviorReviewResult> => {
  const start = trades.map((trade) => trade.entryAt).sort()[0] ?? new Date().toISOString();
  const end =
    trades
      .map((trade) => trade.exitAt)
      .sort()
      .at(-1) ?? new Date().toISOString();
  const [metrics, window] = await Promise.all([
    requestAnalysis('/journal/analysis/behavior', { trades }, client),
    requestAnalysis('/journal/analysis/review', { trades, start, end }, client),
  ]);
  const aiRun = await startAiExplanation(
    { kind: 'behavior-review', window: { start, end }, metrics, review: window },
    undefined,
    client,
  );
  return { metrics, window, aiRun };
};
