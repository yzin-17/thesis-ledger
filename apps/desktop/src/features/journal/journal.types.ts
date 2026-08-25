import type { JournalReviewCandidate as ApiJournalReviewCandidate } from '@thesis-ledger/api-client';

export interface ReviewTrade {
  symbol: string;
  entryAt: string;
  exitAt: string;
  pnl: number;
  plannedStop?: number;
  actualExit?: number;
  plannedHoldingDays?: number;
  entryPrice?: number;
  exitPrice?: number;
  plannedEntry?: number;
  plannedExit?: number;
  turnover?: number;
  peakWeight?: number;
  targetWeight?: number;
  quantity?: number;
}

export type JournalReviewCandidate = ApiJournalReviewCandidate;

export type ReviewWindowPreset = '7d' | '30d' | 'custom';

export interface ReviewWindow {
  start: string;
  end: string;
}

export interface ReviewEvidenceDraft {
  plannedStop?: number;
  plannedHoldingDays?: number;
  plannedEntry?: number;
  plannedExit?: number;
  peakWeight?: number;
  targetWeight?: number;
}

export interface JournalAiRun {
  id: string;
  provider: string;
  model: string;
  promptVersion: string;
}

export interface DeterministicJournalReviewResult {
  plannedVsActual: unknown;
  behavior: unknown;
  counterfactual: unknown;
}

export interface JournalReviewResult {
  plannedVsActual: unknown;
  behavior: unknown;
  counterfactual: unknown;
  aiRun: JournalAiRun | null;
}

export interface BehaviorReviewResult {
  metrics: unknown;
  window: unknown;
  aiRun: JournalAiRun | null;
}
