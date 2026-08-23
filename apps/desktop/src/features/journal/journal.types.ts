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
}

export interface JournalReviewResult {
  plannedVsActual: unknown;
  behavior: unknown;
  counterfactual: unknown;
  aiRun: { id: string; provider: string; model: string; promptVersion: string } | null;
}

export interface BehaviorReviewResult {
  metrics: unknown;
  window: unknown;
  aiRun: JournalReviewResult['aiRun'];
}
