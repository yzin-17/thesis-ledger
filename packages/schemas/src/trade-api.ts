import { z } from 'zod';
import {
  currencyCodeSchema,
  decimalStringSchema,
  executionChargeSchema,
  ledgerEventSourceSchema,
  ledgerEventEnvelopeSchema,
} from './ledger-contract.js';
import { instrumentDirectorySchema } from './market.js';

const nonNegativeIntegerStringSchema = z.string().regex(/^\d+$/);
const isoDateTimeSchema = z.iso.datetime({ offset: true });

const tradeModeSchema = z.enum(['actual', 'shadow']);
const tradeLifecycleSchema = z.enum(['ACTIVE', 'ENDED']);
const tradeExitProgressSchema = z.enum(['NONE', 'PARTIAL', 'FULL']);
const tradeEndEvidenceSchema = z.enum(['SELL_EXECUTION', 'BALANCE_OBSERVATION', 'UNKNOWN']);
const tradeCompletenessSchema = z.enum(['COMPLETE', 'PARTIAL', 'CONFLICTED']);

const tradeSourceSchema = ledgerEventSourceSchema;

const tradeSummaryShape = {
  id: z.string().trim().min(1),
  accountId: z.uuid(),
  accountMode: tradeModeSchema,
  symbol: z.string().trim().min(1),
  assetName: z.string().trim().min(1).optional(),
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

export const tradeSummaryResponseSchema = z.object(tradeSummaryShape).strict();

export const tradeEntryLegResponseSchema = z
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
    charges: z.array(executionChargeSchema),
  })
  .strict();

export const tradeBaselineComponentResponseSchema = z
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

export const tradeCorporateActionResponseSchema = z
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

export const tradeCloseAllocationResponseSchema = z
  .object({
    id: z.string().trim().min(1),
    source: z.enum(['ENTRY_LEG', 'BASELINE_COMPONENT']),
    sourceEventId: z.uuid(),
    sourceFactId: z.uuid(),
    quantity: decimalStringSchema,
    originalCost: decimalStringSchema.nullable(),
    allocatedBuyCharges: z.array(executionChargeSchema),
  })
  .strict();

export const tradeCloseSliceResponseSchema = z
  .object({
    id: z.string().trim().min(1),
    eventId: z.uuid(),
    factId: z.uuid(),
    occurredAt: isoDateTimeSchema.nullable(),
    currency: currencyCodeSchema,
    price: decimalStringSchema.nullable(),
    quantity: decimalStringSchema,
    remainingQuantityAfter: decimalStringSchema,
    charges: z.array(executionChargeSchema),
    grossRealizedPnl: decimalStringSchema.nullable(),
    netRealizedPnl: decimalStringSchema.nullable(),
    realizedNetReturnRate: decimalStringSchema.nullable(),
    costEstimated: z.boolean(),
    allocations: z.array(tradeCloseAllocationResponseSchema),
  })
  .strict();

export const tradeDividendResponseSchema = z
  .object({
    id: z.string().trim().min(1),
    eventId: z.uuid(),
    factId: z.uuid(),
    occurredAt: isoDateTimeSchema.nullable(),
    amount: decimalStringSchema,
    currency: currencyCodeSchema,
  })
  .strict();

export const tradeEvidenceSourceResponseSchema = z
  .object({
    id: z.string().trim().min(1),
    kind: z.enum([
      'EXECUTION',
      'BASELINE_OBSERVATION',
      'OPENING_BOUNDARY_ASSERTION',
      'BASELINE_RECONCILIATION',
      'CORPORATE_ACTION',
      'DIVIDEND',
    ]),
    eventId: z.uuid(),
    factId: z.uuid(),
    source: tradeSourceSchema,
  })
  .strict();

export const tradeDetailResponseSchema = z
  .object({
    ...tradeSummaryShape,
    entryLegs: z.array(tradeEntryLegResponseSchema),
    baselineComponents: z.array(tradeBaselineComponentResponseSchema),
    corporateActions: z.array(tradeCorporateActionResponseSchema),
    closeSlices: z.array(tradeCloseSliceResponseSchema),
    dividendAttributions: z.array(tradeDividendResponseSchema),
    evidenceSources: z.array(tradeEvidenceSourceResponseSchema),
  })
  .strict();

export const tradeListQuerySchema = z
  .object({
    accountId: z.uuid().optional(),
    mode: tradeModeSchema.default('actual'),
    symbol: z.string().trim().min(1).optional(),
    lifecycle: tradeLifecycleSchema.optional(),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const tradeListResponseSchema = z
  .object({
    accountId: z.uuid().nullable(),
    mode: tradeModeSchema,
    items: z.array(tradeSummaryResponseSchema),
    nextCursor: z.string().nullable(),
    projectionGenerations: z.record(z.uuid(), nonNegativeIntegerStringSchema),
  })
  .strict();

export const tradeModeQuerySchema = z
  .object({ mode: tradeModeSchema.default('actual') })
  .strict();

export const tradeReferenceResolveRequestSchema = z
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

export const tradeReferenceResolveResponseSchema = z
  .object({
    accountId: z.uuid(),
    mode: tradeModeSchema,
    status: z.enum(['RESOLVED', 'LEGACY', 'AMBIGUOUS', 'NOT_FOUND']),
    trade: tradeDetailResponseSchema.optional(),
    snapshot: z.unknown().optional(),
    matchedFactIds: z.array(z.uuid()),
    candidateTradeIds: z.array(z.string().trim().min(1)),
  })
  .strict();

export const tradeCloseSliceQueryResponseSchema = z
  .object({
    accountId: z.uuid(),
    mode: tradeModeSchema,
    tradeId: z.string().trim().min(1),
    projectionGeneration: nonNegativeIntegerStringSchema,
    slice: tradeCloseSliceResponseSchema,
  })
  .strict();

const ledgerReadBaseShape = {
  accountId: z.uuid(),
  ledgerRevision: nonNegativeIntegerStringSchema,
  projectionGeneration: nonNegativeIntegerStringSchema,
  events: z.array(ledgerEventEnvelopeSchema),
  instrumentDirectory: instrumentDirectorySchema,
};

export const ledgerEventsResponseSchema = z
  .object({
    ...ledgerReadBaseShape,
    asOfLedgerRevision: nonNegativeIntegerStringSchema.optional(),
    effective: z.literal(true),
  })
  .strict();

export const ledgerAuditResponseSchema = z
  .object({
    accountId: z.uuid(),
    asOfLedgerRevision: nonNegativeIntegerStringSchema,
    ledgerRevision: nonNegativeIntegerStringSchema,
    projectionGeneration: nonNegativeIntegerStringSchema,
    events: z.array(ledgerEventEnvelopeSchema),
    instrumentDirectory: instrumentDirectorySchema,
    effective: z.literal(false),
  })
  .strict();

export const ledgerReplayResponseSchema = z
  .object({
    ...ledgerReadBaseShape,
    asOfLedgerRevision: nonNegativeIntegerStringSchema,
    replayed: z.literal(true),
  })
  .strict();

export const importDraftRevisionResponseSchema = z
  .object({
    draftId: z.uuid(),
    revision: z.number().int().positive(),
    rowIds: z.array(z.string().trim().min(1)),
  })
  .strict();

export const importDraftCommandResponseSchema = z
  .object({
    draftId: z.uuid(),
    revision: z.number().int().positive(),
    idempotentReplay: z.boolean(),
  })
  .strict();

export const importDraftResponseSchema = z
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

export type TradeSummaryResponse = z.infer<typeof tradeSummaryResponseSchema>;
export type TradeDetailResponse = z.infer<typeof tradeDetailResponseSchema>;
export type TradeListQuery = z.infer<typeof tradeListQuerySchema>;
export type TradeListResponse = z.infer<typeof tradeListResponseSchema>;
export type TradeReferenceResolveRequest = z.infer<typeof tradeReferenceResolveRequestSchema>;
export type TradeReferenceResolveResponse = z.infer<typeof tradeReferenceResolveResponseSchema>;
export type TradeCloseSliceQueryResponse = z.infer<typeof tradeCloseSliceQueryResponseSchema>;
export type LedgerEventsResponse = z.infer<typeof ledgerEventsResponseSchema>;
export type LedgerAuditResponse = z.infer<typeof ledgerAuditResponseSchema>;
export type LedgerReplayResponse = z.infer<typeof ledgerReplayResponseSchema>;
export type ImportDraftRevisionResponse = z.infer<typeof importDraftRevisionResponseSchema>;
export type ImportDraftCommandResponse = z.infer<typeof importDraftCommandResponseSchema>;
export type ImportDraftResponse = z.infer<typeof importDraftResponseSchema>;
