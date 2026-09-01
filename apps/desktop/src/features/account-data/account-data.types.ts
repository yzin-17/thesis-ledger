import type { LedgerAuditResponseV2, LedgerEventV2 } from '@thesis-ledger/api-client';

import type { Account } from '../portfolio/portfolio.types.js';
import type { TransferEvent } from './account-data.cash.api.js';

export type AccountDataTab = 'positions' | 'transactions' | 'cash';
export type ExecutionSide = 'BUY' | 'SELL';
export type TimePrecision = 'INSTANT' | 'DATE';
export type Currency = Account['currency'];
export type LedgerAuditEvent = LedgerAuditResponseV2['events'][number];
export type ExecutionEvent = Extract<LedgerEventV2, { type: 'BUY_EXECUTION' | 'SELL_EXECUTION' }>;
export type VoidEvent = Extract<LedgerEventV2, { revisionAction: 'VOID' }>;
export type CashTransferEvent = TransferEvent;

export const isCashTransferEvent = (event: LedgerEventV2): event is CashTransferEvent =>
  event.type === 'CASH_FLOW' &&
  event.revisionAction !== 'VOID' &&
  event.payload.category === 'TRANSFER' &&
  event.payload.transfer !== undefined;

export type ChargeCategory = 'COMMISSION' | 'TAX' | 'LEVY' | 'EXCHANGE' | 'REGULATORY' | 'OTHER';
export type ChargeDraft = {
  category: ChargeCategory;
  amount: string;
  currency: Currency;
  description: string;
};
export type ExecutionDraft = {
  side: ExecutionSide;
  symbol: string;
  quantity: string;
  price: string;
  currency: Currency;
  occurredAt: string;
  timePrecision: TimePrecision;
  settledAt: string;
  capabilityVerification: 'VERIFIED' | 'UNVERIFIED';
  note: string;
  reason: string;
};
