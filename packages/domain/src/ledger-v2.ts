export type DecimalString = string;
export type CurrencyCode = string;

export interface MoneyV2 {
  amount: DecimalString;
  currency: CurrencyCode;
}

export type LedgerEventTypeV2 =
  | 'BUY_EXECUTION'
  | 'SELL_EXECUTION'
  | 'POSITION_BASELINE_OBSERVATION'
  | 'CASH_BALANCE_OBSERVATION'
  | 'BASELINE_RECONCILIATION'
  | 'BONUS_SHARE'
  | 'SPLIT'
  | 'MERGE'
  | 'DIVIDEND'
  | 'CASH_FLOW';

export type LedgerRevisionAction = 'CREATE' | 'REPLACE' | 'VOID' | 'RESTORE';
export type LedgerTimePrecision = 'INSTANT' | 'DATE' | 'UNKNOWN';

export interface LedgerEventSourceV2 {
  category: 'MANUAL' | 'IMPORT' | 'INTEGRATION' | 'MIGRATION';
  channel: string;
  externalId?: string;
  draftId?: string;
  sourceRowId?: string;
}

export interface ExecutionChargeV2 {
  category: 'COMMISSION' | 'TAX' | 'LEVY' | 'EXCHANGE' | 'REGULATORY' | 'OTHER';
  amount: DecimalString;
  currency: CurrencyCode;
  description?: string;
}

export interface ExecutionPayloadV2 {
  symbol: string;
  quantity: DecimalString;
  price: DecimalString;
  currency: CurrencyCode;
  settledAt?: string;
  capabilityVerification: 'VERIFIED' | 'UNVERIFIED';
  charges: ExecutionChargeV2[];
  note?: string;
}

export interface PositionBaselineObservationPayloadV2 {
  symbol: string;
  batchId: string;
  batchScope: 'FULL' | 'PARTIAL';
  quantity: DecimalString;
  averageCost?: DecimalString;
  currency: CurrencyCode;
  costIncludesFees: 'INCLUDES_FEES' | 'EXCLUDES_FEES' | 'UNKNOWN';
  capturedAt?: string;
}

export interface CashBalanceObservationPayloadV2 {
  currency: CurrencyCode;
  amount: DecimalString;
  capturedAt?: string;
}

export interface BaselineReconciliationPayloadV2 {
  symbol: string;
  baselineFactId: string;
  executionFactIds: string[];
  coveredQuantity: DecimalString;
  coveredCost: DecimalString;
  ruleVersion: number;
}

export interface BonusSharePayloadV2 {
  symbol: string;
  quantity: DecimalString;
}

export interface RatioCorporateActionPayloadV2 {
  symbol: string;
  fromUnits: DecimalString;
  toUnits: DecimalString;
}

export interface DividendPayloadV2 {
  symbol: string;
  amount: DecimalString;
  currency: CurrencyCode;
  settledAt?: string;
}

export interface CashFlowPayloadV2 {
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

export interface LedgerEventPayloadByTypeV2 {
  BUY_EXECUTION: ExecutionPayloadV2;
  SELL_EXECUTION: ExecutionPayloadV2;
  POSITION_BASELINE_OBSERVATION: PositionBaselineObservationPayloadV2;
  CASH_BALANCE_OBSERVATION: CashBalanceObservationPayloadV2;
  BASELINE_RECONCILIATION: BaselineReconciliationPayloadV2;
  BONUS_SHARE: BonusSharePayloadV2;
  SPLIT: RatioCorporateActionPayloadV2;
  MERGE: RatioCorporateActionPayloadV2;
  DIVIDEND: DividendPayloadV2;
  CASH_FLOW: CashFlowPayloadV2;
}

export interface LedgerEventEnvelopeBaseV2<TType extends LedgerEventTypeV2> {
  version: 2;
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
  source: LedgerEventSourceV2;
  actorId: string;
}

export type LedgerEventPayloadRevisionV2<TType extends LedgerEventTypeV2> =
  LedgerEventEnvelopeBaseV2<TType> & {
    revisionAction: 'CREATE' | 'REPLACE' | 'RESTORE';
    payload: LedgerEventPayloadByTypeV2[TType];
    supersedesEventId?: string;
    reason?: string;
  };

export type LedgerEventVoidRevisionV2<TType extends LedgerEventTypeV2 = LedgerEventTypeV2> =
  LedgerEventEnvelopeBaseV2<TType> & {
    revisionAction: 'VOID';
    supersedesEventId: string;
    reason: string;
  };

export type LedgerEventV2 =
  | {
      [TType in LedgerEventTypeV2]: LedgerEventPayloadRevisionV2<TType>;
    }[LedgerEventTypeV2]
  | LedgerEventVoidRevisionV2;

export type LedgerCommandErrorCodeV2 =
  | 'LEDGER_VALIDATION_FAILED'
  | 'LEDGER_REVISION_CONFLICT'
  | 'LEDGER_IDEMPOTENCY_CONFLICT'
  | 'LEDGER_FACT_NOT_FOUND'
  | 'LEDGER_CORRECTION_NOT_CHAIN_TIP'
  | 'LEDGER_CORRECTION_ACCOUNT_MISMATCH'
  | 'LEDGER_RESTORE_REQUIRES_VOID'
  | 'LEDGER_INSUFFICIENT_POSITION'
  | 'LEDGER_PROJECTION_FAILED';

export interface LedgerCommandErrorV2 {
  errorCode: LedgerCommandErrorCodeV2;
  message: string;
  accountId?: string;
  currentLedgerRevision?: string;
  details?: Record<string, unknown>;
}
