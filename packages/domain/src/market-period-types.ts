import type { TradingMarket } from './trading-calendar.js';

export const MARKET_PERIOD_RULE_VERSION = 'market-period-aggregation-v1' as const;
export type MarketPeriod = '5d' | '1w' | '1mo' | '1y';
export type MarketPeriodAdjustment = 'none' | 'qfq' | 'hfq';
export type MarketPeriodCompletion = 'complete' | 'incomplete' | 'unknown';

export interface MarketPeriodSession {
  tradingDate: string;
  startAt: string;
  endAt: string;
}

/** coverageStart/End 证明整个区间的计划 Session 集合，包括没有交易的日期。 */
export interface MarketPeriodCalendarFact {
  market: TradingMarket;
  timezone: string;
  revision: string;
  availableAt: string;
  coverageStart: string;
  coverageEnd: string;
  sessions: readonly MarketPeriodSession[];
}

export interface MarketPeriodDailyBar {
  symbol: string;
  tradingDate: string;
  timestamp: string;
  adjustment: MarketPeriodAdjustment;
  priceBasisFingerprint: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  amount: number | null;
  completionStatus: MarketPeriodCompletion;
  availableAt: string;
}

export interface MarketPeriodNoTradingEvidence {
  symbol: string;
  tradingDate: string;
  calendarRevision: string;
  baseInputFingerprint: string;
  revision: string;
  availableAt: string;
  evidenceRef: string;
  reason: 'suspended' | 'no-trading';
}

export interface MarketPeriodAggregationInput {
  symbol: string;
  timeframe: MarketPeriod;
  adjustment: MarketPeriodAdjustment;
  priceBasisFingerprint: string;
  baseInputFingerprint: string;
  evaluationAsOf: string;
  ruleVersion: typeof MARKET_PERIOD_RULE_VERSION;
  anchorTradingDate?: string;
  calendar: MarketPeriodCalendarFact;
  bars: readonly MarketPeriodDailyBar[];
  noTradingEvidence: readonly MarketPeriodNoTradingEvidence[];
}

export interface MarketPeriodBar {
  timestamp: string;
  tradingDate: string;
  bucketStartDate: string;
  bucketEndDate: string;
  bucketEndAt: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  amount: number | null;
  completionStatus: MarketPeriodCompletion;
  availableAt: string;
  expectedTradingDates: readonly string[];
  observedTradingDates: readonly string[];
  explainedTradingDates: readonly string[];
  missingTradingDates: readonly string[];
}

export interface MarketPeriodAggregation {
  symbol: string;
  adjustment: MarketPeriodAdjustment;
  priceBasisFingerprint: string;
  kind: 'derived';
  provider: 'thesis-ledger-server';
  providerRevision: typeof MARKET_PERIOD_RULE_VERSION;
  timeframe: MarketPeriod;
  calendarRevision: string;
  baseInputFingerprint: string;
  evaluationAsOf: string;
  anchorTradingDate?: string;
  coverageEvidence: readonly MarketPeriodNoTradingEvidence[];
  points: readonly MarketPeriodBar[];
}
