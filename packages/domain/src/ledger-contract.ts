export type DecimalString = string;
export type CurrencyCode = string;

export interface LedgerMoney {
  amount: DecimalString;
  currency: CurrencyCode;
}

export type LedgerEventType =
  | 'BUY_EXECUTION'
  | 'SELL_EXECUTION'
  | 'POSITION_BASELINE_OBSERVATION'
  | 'TRADE_OPENING_BOUNDARY_ASSERTION'
  | 'CASH_BALANCE_OBSERVATION'
  | 'BASELINE_RECONCILIATION'
  | 'BONUS_SHARE'
  | 'SPLIT'
  | 'MERGE'
  | 'DIVIDEND'
  | 'CASH_FLOW';

export type LedgerRevisionAction = 'CREATE' | 'REPLACE' | 'VOID' | 'RESTORE';
export type LedgerTimePrecision = 'INSTANT' | 'DATE' | 'UNKNOWN';

export interface LedgerEventSource {
  category: 'MANUAL' | 'IMPORT' | 'INTEGRATION' | 'MIGRATION';
  channel: string;
  externalId?: string;
  draftId?: string;
  sourceRowId?: string;
}

export interface ExecutionCharge {
  category: 'COMMISSION' | 'TAX' | 'LEVY' | 'EXCHANGE' | 'REGULATORY' | 'OTHER';
  amount: DecimalString;
  currency: CurrencyCode;
  description?: string;
}

export interface ExecutionPayload {
  symbol: string;
  quantity: DecimalString;
  price: DecimalString;
  currency: CurrencyCode;
  settledAt?: string;
  capabilityVerification: 'VERIFIED' | 'UNVERIFIED';
  charges: ExecutionCharge[];
  note?: string;
}

export interface PositionBaselineObservationPayload {
  symbol: string;
  batchId: string;
  batchScope: 'FULL' | 'PARTIAL';
  quantity: DecimalString;
  averageCost?: DecimalString;
  currency: CurrencyCode;
  costIncludesFees: 'INCLUDES_FEES' | 'EXCLUDES_FEES' | 'UNKNOWN';
  capturedAt?: string;
}

export interface CashBalanceObservationPayload {
  currency: CurrencyCode;
  amount: DecimalString;
  capturedAt?: string;
}

export interface BaselineReconciliationPayload {
  symbol: string;
  baselineFactId: string;
  executionFactIds: string[];
  coveredQuantity: DecimalString;
  coveredCost: DecimalString;
  ruleVersion: number;
}

export interface BonusSharePayload {
  symbol: string;
  quantity: DecimalString;
}

export interface RatioCorporateActionPayload {
  symbol: string;
  fromUnits: DecimalString;
  toUnits: DecimalString;
}

export interface DividendPayload {
  symbol: string;
  amount: DecimalString;
  currency: CurrencyCode;
  settledAt?: string;
}

export interface CashFlowPayload {
  direction: 'INFLOW' | 'OUTFLOW';
  category: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' | 'INTEREST' | 'FEE' | 'TAX';
  amount: DecimalString;
  currency: CurrencyCode;
  settledAt?: string;
  note?: string;
  transfer?: {
    transferId: string;
    counterpartyAccountId: string;
    leg: 'OUTFLOW' | 'INFLOW';
  };
}

export interface LedgerEventPayloadByType {
  BUY_EXECUTION: ExecutionPayload;
  SELL_EXECUTION: ExecutionPayload;
  POSITION_BASELINE_OBSERVATION: PositionBaselineObservationPayload;
  TRADE_OPENING_BOUNDARY_ASSERTION: {
    symbol: string;
    tradeId: string;
    baselineFactId: string;
  };
  CASH_BALANCE_OBSERVATION: CashBalanceObservationPayload;
  BASELINE_RECONCILIATION: BaselineReconciliationPayload;
  BONUS_SHARE: BonusSharePayload;
  SPLIT: RatioCorporateActionPayload;
  MERGE: RatioCorporateActionPayload;
  DIVIDEND: DividendPayload;
  CASH_FLOW: CashFlowPayload;
}

export interface LedgerEventEnvelopeBase<TType extends LedgerEventType> {
  version: 3;
  eventId: string;
  factId: string;
  accountId: string;
  ledgerRevision: string;
  type: TType;
  occurredAt: string | null;
  timePrecision: LedgerTimePrecision;
  sourceTimezone: string;
  economicOrderKey: string;
  recordedAt: string;
  payloadVersion: number;
  source: LedgerEventSource;
  actorId: string;
}

export type LedgerEventPayloadRevision<TType extends LedgerEventType> =
  LedgerEventEnvelopeBase<TType> & {
    revisionAction: 'CREATE' | 'REPLACE' | 'RESTORE';
    payload: LedgerEventPayloadByType[TType];
    supersedesEventId?: string;
    reason?: string;
  };

export type LedgerEventVoidRevision<TType extends LedgerEventType = LedgerEventType> =
  LedgerEventEnvelopeBase<TType> & {
    revisionAction: 'VOID';
    supersedesEventId: string;
    reason: string;
  };

export type LedgerEvent =
  | {
      [TType in LedgerEventType]: LedgerEventPayloadRevision<TType>;
    }[LedgerEventType]
  | LedgerEventVoidRevision;

export type LedgerCommandErrorCode =
  | 'LEDGER_VALIDATION_FAILED'
  | 'LEDGER_REVISION_CONFLICT'
  | 'LEDGER_IDEMPOTENCY_CONFLICT'
  | 'LEDGER_FACT_NOT_FOUND'
  | 'LEDGER_CORRECTION_NOT_CHAIN_TIP'
  | 'LEDGER_CORRECTION_ACCOUNT_MISMATCH'
  | 'LEDGER_RESTORE_REQUIRES_VOID'
  | 'LEDGER_INSUFFICIENT_POSITION'
  | 'LEDGER_PROJECTION_FAILED';

export interface LedgerCommandError {
  errorCode: LedgerCommandErrorCode;
  message: string;
  accountId?: string;
  currentLedgerRevision?: string;
  details?: Record<string, unknown>;
}
