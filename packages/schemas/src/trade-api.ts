import { z } from 'zod';
import {
  currencyCodeSchema,
  decimalStringSchema,
  executionChargeSchemaV2,
  ledgerEventSourceSchemaV2,
  ledgerEventEnvelopeSchemaV2,
} from './ledger-v2.js';

const nonNegativeIntegerStringSchema = z.string().regex(/^\d+$/);
const isoDateTimeSchema = z.iso.datetime({ offset: true });

const tradeModeSchema = z.enum(['actual', 'shadow']);
const tradeLifecycleSchema = z.enum(['ACTIVE', 'ENDED']);
const tradeExitProgressSchema = z.enum(['NONE', 'PARTIAL', 'FULL']);
const tradeEndEvidenceSchema = z.enum(['SELL_EXECUTION', 'BALANCE_OBSERVATION', 'UNKNOWN']);
const tradeCompletenessSchema = z.enum(['COMPLETE', 'PARTIAL', 'CONFLICTED']);

const tradeSourceSchema = ledgerEventSourceSchemaV2;

const tradeSummaryShape = {
  id: z.string().trim().min(1),
  accountId: z.uuid(),
  accountMode: tradeModeSchema,
  symbol: z.string().trim().min(1),
  lifecycle: tradeLifecycleSchema,
  exitProgress: tradeExitProgressSchema,
  endEvidence: tradeEndEvidenceSchema,
  openedAt: isoDateTimeSchema.nullable(),
  closedAt: isoDateTimeSchema.nullable(),
  earliestEvidenceAt: isoDateTimeSchema.nullable(),
  sourceQuantity: decimalStringSchema,
  closedQuantity: decimalStringSchema,
  remainingQuantity: decimalStringSchema,
  grossRealizedPnl: decimalStringSchema.nullable(),
  netRealizedPnl: decimalStringSchema.nullable(),
  realizedNetReturnRate: decimalStringSchema.nullable(),
  costEstimated: z.boolean(),
  completeness: tradeCompletenessSchema,
  issues: z.array(z.string().trim().min(1)),
  costIssues: z.array(z.string().trim().min(1)),
  algorithmVersion: z.string().trim().min(1),
  projectionFingerprint: z.string().trim().min(1).nullable(),
  projectionGeneration: nonNegativeIntegerStringSchema,
  excludedReasons: z.array(z.string().trim().min(1)),
};

export const tradeSummaryResponseSchemaV2 = z.object(tradeSummaryShape).strict();

export const tradeEntryLegResponseSchemaV2 = z
  .object({
    id: z.string().trim().min(1),
    eventId: z.uuid(),
    factId: z.uuid(),
    occurredAt: isoDateTimeSchema.nullable(),
    currency: currencyCodeSchema,
    price: decimalStringSchema,
    originalQuantity: decimalStringSchema,
    quantity: decimalStringSchema,
    remainingQuantity: decimalStringSchema,
    rawCost: decimalStringSchema.nullable(),
    remainingCost: decimalStringSchema.nullable(),
    rawCostEstimated: z.boolean(),
    charges: z.array(executionChargeSchemaV2),
  })
  .strict();

export const tradeBaselineComponentResponseSchemaV2 = z
  .object({
    id: z.string().trim().min(1),
    eventId: z.uuid(),
    factId: z.uuid(),
    batchId: z.uuid(),
    batchScope: z.enum(['FULL', 'PARTIAL']),
    occurredAt: isoDateTimeSchema.nullable(),
    currency: currencyCodeSchema,
    observedQuantity: decimalStringSchema,
    quantity: decimalStringSchema,
    remainingQuantity: decimalStringSchema,
    averageCost: decimalStringSchema.nullable(),
    rawCost: decimalStringSchema.nullable(),
    remainingCost: decimalStringSchema.nullable(),
    rawCostEstimated: z.boolean(),
    costIncludesFees: z.enum(['INCLUDES_FEES', 'EXCLUDES_FEES', 'UNKNOWN']),
    reconciledExecutionFactIds: z.array(z.uuid()),
    reconciliationFactIds: z.array(z.uuid()),
  })
  .strict();

export const tradeCorporateActionResponseSchemaV2 = z
  .object({
    id: z.string().trim().min(1),
    eventId: z.uuid(),
    factId: z.uuid(),
    type: z.enum(['BONUS_SHARE', 'SPLIT', 'MERGE']),
    occurredAt: isoDateTimeSchema.nullable(),
    quantity: decimalStringSchema.nullable(),
    fromUnits: decimalStringSchema.nullable(),
    toUnits: decimalStringSchema.nullable(),
    positionQuantityBefore: decimalStringSchema,
    positionQuantityAfter: decimalStringSchema,
  })
  .strict();

export const tradeCloseAllocationResponseSchemaV2 = z
  .object({
    id: z.string().trim().min(1),
    source: z.enum(['ENTRY_LEG', 'BASELINE_COMPONENT']),
    sourceEventId: z.uuid(),
    sourceFactId: z.uuid(),
    quantity: decimalStringSchema,
    originalCost: decimalStringSchema.nullable(),
    allocatedBuyCharges: z.array(executionChargeSchemaV2),
  })
  .strict();

export const tradeCloseSliceResponseSchemaV2 = z
  .object({
    id: z.string().trim().min(1),
    eventId: z.uuid(),
    factId: z.uuid(),
    occurredAt: isoDateTimeSchema.nullable(),
    currency: currencyCodeSchema,
    price: decimalStringSchema.nullable(),
    quantity: decimalStringSchema,
    remainingQuantityAfter: decimalStringSchema,
    charges: z.array(executionChargeSchemaV2),
    grossRealizedPnl: decimalStringSchema.nullable(),
    netRealizedPnl: decimalStringSchema.nullable(),
    realizedNetReturnRate: decimalStringSchema.nullable(),
    costEstimated: z.boolean(),
    allocations: z.array(tradeCloseAllocationResponseSchemaV2),
  })
  .strict();

export const tradeDividendResponseSchemaV2 = z
  .object({
    id: z.string().trim().min(1),
    eventId: z.uuid(),
    factId: z.uuid(),
    occurredAt: isoDateTimeSchema.nullable(),
    amount: decimalStringSchema,
    currency: currencyCodeSchema,
  })
  .strict();

export const tradeEvidenceSourceResponseSchemaV2 = z
  .object({
    id: z.string().trim().min(1),
    kind: z.enum([
      'EXECUTION',
      'BASELINE_OBSERVATION',
      'BASELINE_RECONCILIATION',
      'CORPORATE_ACTION',
      'DIVIDEND',
    ]),
    eventId: z.uuid(),
    factId: z.uuid(),
    source: tradeSourceSchema,
  })
  .strict();

export const tradeDetailResponseSchemaV2 = z
  .object({
    ...tradeSummaryShape,
    entryLegs: z.array(tradeEntryLegResponseSchemaV2),
    baselineComponents: z.array(tradeBaselineComponentResponseSchemaV2),
    corporateActions: z.array(tradeCorporateActionResponseSchemaV2),
    closeSlices: z.array(tradeCloseSliceResponseSchemaV2),
    dividendAttributions: z.array(tradeDividendResponseSchemaV2),
    evidenceSources: z.array(tradeEvidenceSourceResponseSchemaV2),
  })
  .strict();

export const tradeListQuerySchemaV2 = z
  .object({
    accountId: z.uuid().optional(),
    mode: tradeModeSchema.default('actual'),
    symbol: z.string().trim().min(1).optional(),
    lifecycle: tradeLifecycleSchema.optional(),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const tradeListResponseSchemaV2 = z
  .object({
    accountId: z.uuid().nullable(),
    mode: tradeModeSchema,
    items: z.array(tradeSummaryResponseSchemaV2),
    nextCursor: z.string().nullable(),
    projectionGenerations: z.record(z.uuid(), nonNegativeIntegerStringSchema),
  })
  .strict();

export const tradeModeQuerySchemaV2 = z
  .object({ mode: tradeModeSchema.default('actual') })
  .strict();

export const tradeReferenceResolveRequestSchemaV2 = z
  .object({
    accountId: z.uuid(),
    mode: tradeModeSchema.default('actual'),
    factIds: z.array(z.uuid()).min(1),
    tradeId: z.string().trim().min(1).optional(),
    snapshot: z.unknown().optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (new Set(request.factIds).size !== request.factIds.length)
      context.addIssue({ code: 'custom', path: ['factIds'], message: 'factIds 不能重复' });
  });

export const tradeReferenceResolveResponseSchemaV2 = z
  .object({
    accountId: z.uuid(),
    mode: tradeModeSchema,
    status: z.enum(['RESOLVED', 'LEGACY', 'AMBIGUOUS', 'NOT_FOUND']),
    trade: tradeDetailResponseSchemaV2.optional(),
    snapshot: z.unknown().optional(),
    matchedFactIds: z.array(z.uuid()),
    candidateTradeIds: z.array(z.string().trim().min(1)),
  })
  .strict();

export const tradeCloseSliceQueryResponseSchemaV2 = z
  .object({
    accountId: z.uuid(),
    mode: tradeModeSchema,
    tradeId: z.string().trim().min(1),
    projectionGeneration: nonNegativeIntegerStringSchema,
    slice: tradeCloseSliceResponseSchemaV2,
  })
  .strict();

export const legacyLedgerEventResponseSchemaV2 = z
  .object({
    version: z.literal(1),
    id: z.uuid(),
    accountId: z.uuid(),
    type: z.string().trim().min(1),
    occurredAt: isoDateTimeSchema.nullable(),
    symbol: z.string().trim().min(1).nullable(),
    quantity: decimalStringSchema.nullable(),
    price: decimalStringSchema.nullable(),
    amount: decimalStringSchema.nullable(),
    fee: decimalStringSchema.nullable(),
    tax: decimalStringSchema.nullable(),
    externalId: z.string().nullable(),
    source: z.string().trim().min(1),
    sourceRowId: z.string().nullable(),
    currency: currencyCodeSchema,
    note: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: isoDateTimeSchema,
  })
  .strict();

const ledgerReadBaseShape = {
  accountId: z.uuid(),
  ledgerRevision: nonNegativeIntegerStringSchema,
  projectionGeneration: nonNegativeIntegerStringSchema,
  events: z.array(ledgerEventEnvelopeSchemaV2),
};

export const ledgerEventsResponseSchemaV2 = z
  .object({
    ...ledgerReadBaseShape,
    asOfLedgerRevision: nonNegativeIntegerStringSchema.optional(),
    effective: z.literal(true),
  })
  .strict();

export const ledgerAuditResponseSchemaV2 = z
  .object({
    accountId: z.uuid(),
    asOfLedgerRevision: nonNegativeIntegerStringSchema,
    ledgerRevision: nonNegativeIntegerStringSchema,
    projectionGeneration: nonNegativeIntegerStringSchema,
    events: z.array(z.union([ledgerEventEnvelopeSchemaV2, legacyLedgerEventResponseSchemaV2])),
    effective: z.literal(false),
  })
  .strict();

export const ledgerReplayResponseSchemaV2 = z
  .object({
    ...ledgerReadBaseShape,
    asOfLedgerRevision: nonNegativeIntegerStringSchema,
    replayed: z.literal(true),
  })
  .strict();

export const importDraftRevisionResponseSchemaV2 = z
  .object({
    draftId: z.uuid(),
    revision: z.number().int().positive(),
    rowIds: z.array(z.string().trim().min(1)),
  })
  .strict();

export const importDraftCommandResponseSchemaV2 = z
  .object({
    draftId: z.uuid(),
    revision: z.number().int().positive(),
    idempotentReplay: z.boolean(),
  })
  .strict();

export const importDraftResponseSchemaV2 = z
  .object({
    id: z.uuid(),
    accountId: z.uuid(),
    source: z.string().trim().min(1),
    sourceConfidence: decimalStringSchema,
    scope: z.enum(['FULL', 'PARTIAL']),
    status: z.enum(['pending', 'reviewed', 'committed', 'partial', 'cancelled']),
    idempotencyKey: z.string().trim().min(1),
    contentFingerprint: z.string().nullable(),
    imageHash: z.string().trim().min(1),
    rows: z.array(z.unknown()),
    baselineHash: z.string().nullable(),
    beforeState: z.unknown().nullable(),
    createdAt: isoDateTimeSchema,
    committedAt: isoDateTimeSchema.nullable(),
    rolledBackAt: isoDateTimeSchema.nullable(),
    currentRevision: z.number().int().nonnegative(),
  })
  .strict();

export type TradeSummaryResponseV2 = z.infer<typeof tradeSummaryResponseSchemaV2>;
export type TradeDetailResponseV2 = z.infer<typeof tradeDetailResponseSchemaV2>;
export type TradeListQueryV2 = z.infer<typeof tradeListQuerySchemaV2>;
export type TradeListResponseV2 = z.infer<typeof tradeListResponseSchemaV2>;
export type TradeReferenceResolveRequestV2 = z.infer<typeof tradeReferenceResolveRequestSchemaV2>;
export type TradeReferenceResolveResponseV2 = z.infer<typeof tradeReferenceResolveResponseSchemaV2>;
export type TradeCloseSliceQueryResponseV2 = z.infer<typeof tradeCloseSliceQueryResponseSchemaV2>;
export type LegacyLedgerEventResponseV2 = z.infer<typeof legacyLedgerEventResponseSchemaV2>;
export type LedgerEventsResponseV2 = z.infer<typeof ledgerEventsResponseSchemaV2>;
export type LedgerAuditResponseV2 = z.infer<typeof ledgerAuditResponseSchemaV2>;
export type LedgerReplayResponseV2 = z.infer<typeof ledgerReplayResponseSchemaV2>;
export type ImportDraftRevisionResponseV2 = z.infer<typeof importDraftRevisionResponseSchemaV2>;
export type ImportDraftCommandResponseV2 = z.infer<typeof importDraftCommandResponseSchemaV2>;
export type ImportDraftResponseV2 = z.infer<typeof importDraftResponseSchemaV2>;
