import type { TradingCalendar } from './trading-calendar.js';
import type {
  SimulationExecutionInstrument,
  SimulationLedgerConfig,
  SimulationLedgerState,
} from './simulation-ledger.js';

export type CnNavRequestType = 'subscribe' | 'redeem';

export type CnNavSimulationRejectCode =
  | 'DUPLICATE_EVENT'
  | 'DUPLICATE_REQUEST'
  | 'INVALID_TIME'
  | 'FUTURE_DATA'
  | 'NAV_DELAYED'
  | 'NAV_UNAVAILABLE'
  | 'INSUFFICIENT_CASH'
  | 'INSUFFICIENT_POSITION'
  | 'RULE_REJECTED'
  | 'UNSUPPORTED_CAPABILITY'
  | 'INSTRUMENT_MISMATCH'
  | 'INVALID_AMOUNT'
  | 'CURRENCY_MISMATCH'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_CANCELLED'
  | 'SETTLEMENT_SOURCE_NOT_FOUND';

export interface CnNavSimulationConfig {
  executionInstrument: SimulationExecutionInstrument;
  ledgerConfig: SimulationLedgerConfig;
  calendar: TradingCalendar;
  calendarVersion: string;
  cutoffLocalTime: string;
  timeframe: '1d' | '60m' | '30m' | '15m' | '5m' | '1m';
}

export interface CnNavRequest {
  eventId: string;
  requestId: string;
  requestType: CnNavRequestType;
  executionSymbol: string;
  requestAt: string;
  amount?: string;
  shares?: string;
  fee?: string;
  occurredAt: string;
  availableAt: string;
}

export interface CnNavCutoffEvent {
  eventId: string;
  requestId: string;
  cutoffAt: string;
  valuationDate: string;
  occurredAt: string;
  availableAt: string;
}

export interface CnNavFact {
  symbol: string;
  market: 'CN';
  instrumentType: 'NAV_FUND';
  nav: string | null;
  valuationDate: string;
  occurredAt: string;
  availableAt: string;
  provider: string;
  providerRevision: string;
  freshness: 'live' | 'delayed' | 'stale' | 'unknown';
  quality: 'complete' | 'partial' | 'suspended' | 'stale' | 'unknown';
  status: 'supported' | 'unsupported' | 'unavailable';
  reason?: string;
}

export interface CnNavPricingEvent {
  eventId: string;
  requestId: string;
  fact: CnNavFact;
}

export type CnNavPricingInput = CnNavPricingEvent;

export interface CnNavConfirmationEvent {
  eventId: string;
  requestId: string;
  confirmationDate?: string;
  occurredAt: string;
  availableAt: string;
}

export interface CnNavShareAvailabilityEvent {
  eventId: string;
  requestId: string;
  shares: string;
  occurredAt: string;
  availableAt: string;
}

export interface CnNavCashSettlementEvent {
  eventId: string;
  requestId: string;
  amount: string;
  occurredAt: string;
  availableAt: string;
}

export interface CnNavCancelEvent {
  eventId: string;
  requestId: string;
  reason?: string;
  occurredAt: string;
  availableAt: string;
}

export type CnNavSimulationEvent =
  | { type: 'request'; payload: CnNavRequest }
  | { type: 'cutoff'; payload: CnNavCutoffEvent }
  | { type: 'nav'; payload: CnNavPricingEvent }
  | { type: 'confirmation'; payload: CnNavConfirmationEvent }
  | { type: 'shareAvailable'; payload: CnNavShareAvailabilityEvent }
  | { type: 'cashSettlement'; payload: CnNavCashSettlementEvent }
  | { type: 'redemptionCash'; payload: CnNavCashSettlementEvent }
  | { type: 'cancel'; payload: CnNavCancelEvent };

export type CnNavRequestStatus =
  'pending' | 'priced' | 'confirmed' | 'shareAvailable' | 'settled' | 'cancelled' | 'rejected';

export interface CnNavRequestState {
  requestId: string;
  requestType: CnNavRequestType;
  executionSymbol: string;
  status: CnNavRequestStatus;
  requestAt: string;
  cutoffAt?: string;
  valuationDate?: string;
  nav?: string;
  navOccurredAt?: string;
  navAvailableAt?: string;
  navProvider?: string;
  navProviderRevision?: string;
  navFreshness?: CnNavFact['freshness'];
  navQuality?: CnNavFact['quality'];
  confirmationAt?: string;
  fee: string;
  requestedAmount?: string;
  requestedShares?: string;
  confirmedShares?: string;
  expectedCashSettlement?: string;
  shareAvailableAt?: string;
  redemptionCashAt?: string;
  fillId?: string;
  reason?: string;
}

export interface CnNavSimulationState {
  ledger: SimulationLedgerState;
  requests: readonly CnNavRequestState[];
  calendarVersion: string;
}

export interface CnNavAppliedEvent {
  applied: true;
  eventId: string;
  requestId: string;
  state: CnNavSimulationState;
}

export interface CnNavRejectedEvent {
  applied: false;
  eventId: string;
  requestId?: string;
  code: CnNavSimulationRejectCode;
  reason: string;
  state: CnNavSimulationState;
}

export type CnNavEventResult = CnNavAppliedEvent | CnNavRejectedEvent;

export class CnNavSimulationError extends Error {
  constructor(
    readonly code: 'UNSUPPORTED_CAPABILITY' | 'INSTRUMENT_MISMATCH' | 'CURRENCY_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'CnNavSimulationError';
  }
}
