import type {
  JournalReviewObjectReference,
  JournalStatisticsExclusionReason,
} from './journal-review.js';

export type JournalMetricUnit = 'AMOUNT' | 'PRICE' | 'RATIO' | 'DAYS' | 'COUNT' | 'QUANTITY';
export type JournalDecimalMetric = {
  status: 'AVAILABLE' | 'INSUFFICIENT_EVIDENCE' | 'NOT_APPLICABLE';
  value: string | null;
  unit: JournalMetricUnit;
  currency: string | null;
  missingEvidence: string[];
};
export interface JournalAnalysisSlice {
  id: string;
  occurredAt: string | null;
  currency: string;
  price: string | null;
  quantity: string;
  netRealizedPnl: string | null;
  realizedNetReturnRate: string | null;
  allocations: readonly {
    source: 'ENTRY_LEG' | 'BASELINE_COMPONENT';
    sourceFactId: string;
    quantity: string;
  }[];
}
export interface JournalAnalysisInput {
  analysisDraft?: {
    plannedEntry?: string | null | undefined;
    plannedExit?: string | null | undefined;
    stopLoss?: string | null | undefined;
    expectedHoldingDays?: number | null | undefined;
    note?: string | undefined;
  } | null;
  reference: JournalReviewObjectReference;
  trade: {
    id: string;
    symbol: string;
    lifecycle: 'ACTIVE' | 'ENDED';
    openedAt: string | null;
    closedAt: string | null;
    netRealizedPnl: string | null;
    realizedNetReturnRate: string | null;
    entryLegs: readonly {
      factId: string;
      currency: string;
      price: string;
      originalQuantity: string;
    }[];
    baselineComponents: readonly { quantity: string }[];
    corporateActions: readonly { occurredAt: string | null }[];
    closeSlices: readonly JournalAnalysisSlice[];
  };
  plan: {
    symbol: string;
    plannedEntry: string | null;
    plannedExit: string | null;
    stopLoss: string | null;
    expectedHoldingDays: number | null;
  } | null;
}
export interface JournalAnalysisCandidate {
  input: JournalAnalysisInput;
  statisticsEligibility: { eligible: boolean; reasons: JournalStatisticsExclusionReason[] };
}
export interface JournalBehaviorEvidence {
  code:
    | 'ENTRY_PRICE_DEVIATION'
    | 'EXIT_PRICE_DEVIATION'
    | 'HOLDING_PERIOD_DEVIATION'
    | 'STOP_EXIT_DEVIATION';
  status: 'DEVIATION' | 'NO_DEVIATION' | 'INSUFFICIENT_EVIDENCE';
  metricKeys: string[];
  missingEvidence: string[];
}
