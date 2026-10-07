import { z } from 'zod';
import {
  currencyCodeSchema,
  executionChargeSchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
} from './ledger-contract.js';
import { isDateOnly } from './temporal.js';

const economicTimeSchema = z.union([z.iso.date(), z.iso.datetime()]);

const refineEconomicTime = (
  value: {
    occurredAt?: string | null | undefined;
    observedAt?: string | null | undefined;
    timePrecision?: 'INSTANT' | 'DATE' | 'UNKNOWN' | undefined;
  },
  context: z.RefinementCtx,
) => {
  const economicTime = value.occurredAt ?? value.observedAt;
  if (!economicTime) {
    if (value.timePrecision && value.timePrecision !== 'UNKNOWN')
      context.addIssue({
        code: 'custom',
        path: ['timePrecision'],
        message: '未知业务时间必须使用 UNKNOWN 精度',
      });
    return;
  }
  if (value.timePrecision === 'DATE' && !isDateOnly(economicTime))
    context.addIssue({ code: 'custom', path: ['timePrecision'], message: 'DATE 必须搭配日期值' });
  if (value.timePrecision === 'INSTANT' && isDateOnly(economicTime))
    context.addIssue({
      code: 'custom',
      path: ['timePrecision'],
      message: 'INSTANT 必须搭配时间值',
    });
};

export const baselineObservationInputSchema = z
  .object({
    symbol: z.string().trim().min(1),
    quantity: nonNegativeDecimalStringSchema,
    averageCost: nonNegativeDecimalStringSchema.optional(),
    currency: currencyCodeSchema,
    costIncludesFees: z.enum(['INCLUDES_FEES', 'EXCLUDES_FEES', 'UNKNOWN']),
    sourceRowId: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

export const createBaselineObservationBatchCommandSchema = z
  .object({
    command: z.literal('CREATE_BASELINE_OBSERVATION_BATCH'),
    batchId: z.uuid(),
    accountId: z.uuid(),
    scope: z.enum(['FULL', 'PARTIAL']),
    observedAt: economicTimeSchema.nullish(),
    timePrecision: z.enum(['INSTANT', 'DATE', 'UNKNOWN']).optional(),
    capturedAt: z.iso.datetime().nullish(),
    sourceTimezone: z.string().trim().min(1).max(100),
    source: z
      .object({
        category: z.enum(['MANUAL', 'IMPORT', 'INTEGRATION', 'MIGRATION']),
        channel: z.string().trim().min(1).max(100),
        externalId: z.string().trim().min(1).max(255),
      })
      .strict(),
    actorId: z.string().trim().min(1).max(255),
    evidenceRef: z.string().trim().min(1).max(2000),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    observations: z.array(baselineObservationInputSchema).min(1),
  })
  .strict()
  .superRefine((command, context) => {
    refineEconomicTime(command, context);
    const symbols = command.observations.map((observation) => observation.symbol);
    if (new Set(symbols).size !== symbols.length)
      context.addIssue({ code: 'custom', path: ['observations'], message: '同一批次标的不能重复' });
  });

const draftExecutionRowSchema = z
  .object({
    rowId: z.string().trim().min(1).max(255),
    kind: z.literal('EXECUTION'),
    side: z.enum(['BUY', 'SELL']),
    occurredAt: economicTimeSchema,
    timePrecision: z.enum(['INSTANT', 'DATE']).optional(),
    sourceTimezone: z.string().trim().min(1).max(100).optional(),
    symbol: z.string().trim().min(1),
    quantity: positiveDecimalStringSchema,
    price: positiveDecimalStringSchema,
    currency: currencyCodeSchema,
    charges: z.array(executionChargeSchema).default([]),
    assetName: z.string().trim().min(1).max(255).optional(),
    assetType: z.enum(['stock', 'etf', 'fund']).optional(),
    issues: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()
  .superRefine(refineEconomicTime);

const draftBaselineRowSchema = baselineObservationInputSchema
  .omit({ sourceRowId: true })
  .extend({
    rowId: z.string().trim().min(1).max(255),
    kind: z.literal('POSITION_BASELINE'),
    observedAt: economicTimeSchema.optional(),
    capturedAt: z.iso.datetime().optional(),
    timePrecision: z.enum(['INSTANT', 'DATE']).optional(),
    sourceTimezone: z.string().trim().min(1).max(100).optional(),
    assetName: z.string().trim().min(1).max(255).optional(),
    assetType: z.enum(['stock', 'etf', 'fund']).optional(),
    issues: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()
  .superRefine(refineEconomicTime);

const draftUnresolvedRowSchema = z
  .object({
    rowId: z.string().trim().min(1).max(255),
    kind: z.literal('UNRESOLVED'),
    raw: z.record(z.string(), z.unknown()),
    issues: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export const importDraftRowSchema = z.discriminatedUnion('kind', [
  draftExecutionRowSchema,
  draftBaselineRowSchema,
  draftUnresolvedRowSchema,
]);

const refineDraftRows = (
  rows: Array<{ rowId: string; kind: string; symbol?: string }>,
  context: z.RefinementCtx,
) => {
  const rowIds = rows.map((row) => row.rowId);
  if (new Set(rowIds).size !== rowIds.length)
    context.addIssue({ code: 'custom', path: ['rows'], message: '来源行 ID 不能重复' });
  const baselineSymbols = rows
    .filter((row) => row.kind === 'POSITION_BASELINE' && row.symbol !== undefined)
    .map((row) => row.symbol!);
  if (new Set(baselineSymbols).size !== baselineSymbols.length)
    context.addIssue({
      code: 'custom',
      path: ['rows'],
      message: '同一 Revision 的基线标的不能重复',
    });
};

export const createImportDraftRevisionCommandSchema = z
  .object({
    command: z.literal('CREATE_IMPORT_DRAFT_REVISION'),
    draftId: z.uuid(),
    accountId: z.uuid(),
    sourceChannel: z.string().trim().min(1).max(100),
    idempotencyKey: z.string().trim().min(1).max(255),
    parserVersion: z.string().trim().min(1).max(100),
    rawEvidenceRef: z.string().trim().min(1).max(2000),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    scope: z.enum(['FULL', 'PARTIAL']).default('FULL'),
    observedAt: economicTimeSchema.optional(),
    capturedAt: z.iso.datetime().optional(),
    timePrecision: z.enum(['INSTANT', 'DATE']).optional(),
    sourceTimezone: z.string().trim().min(1).max(100).optional(),
    rows: z.array(importDraftRowSchema).min(1),
  })
  .strict()
  .superRefine((command, context) => {
    refineEconomicTime(command, context);
    refineDraftRows(command.rows, context);
  });

export const submitImportDraftRevisionCommandSchema = z
  .object({
    command: z.literal('SUBMIT_IMPORT_DRAFT_REVISION'),
    draftId: z.uuid(),
    revision: z.number().int().positive(),
    expectedLedgerRevision: z.string().regex(/^\d+$/),
    selectedRowIds: z.array(z.string().trim().min(1).max(255)).min(1),
    actorId: z.string().trim().min(1).max(255),
  })
  .strict()
  .superRefine((command, context) => {
    if (new Set(command.selectedRowIds).size !== command.selectedRowIds.length)
      context.addIssue({ code: 'custom', path: ['selectedRowIds'], message: '选中行 ID 不能重复' });
  });

export const reviseImportDraftCommandSchema = z
  .object({
    command: z.literal('REVISE_IMPORT_DRAFT'),
    draftId: z.uuid(),
    expectedRevision: z.number().int().positive(),
    parserVersion: z.string().trim().min(1).max(100),
    rawEvidenceRef: z.string().trim().min(1).max(2000),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    scope: z.enum(['FULL', 'PARTIAL']).optional(),
    observedAt: economicTimeSchema.optional(),
    capturedAt: z.iso.datetime().optional(),
    timePrecision: z.enum(['INSTANT', 'DATE']).optional(),
    sourceTimezone: z.string().trim().min(1).max(100).optional(),
    sourceChannel: z.string().trim().min(1).max(100).optional(),
    rows: z.array(importDraftRowSchema).min(1),
  })
  .strict()
  .superRefine((command, context) => {
    refineEconomicTime(command, context);
    refineDraftRows(command.rows, context);
  });

export type BaselineObservationInput = z.infer<typeof baselineObservationInputSchema>;
export type CreateBaselineObservationBatchCommand = z.infer<
  typeof createBaselineObservationBatchCommandSchema
>;
export type ImportDraftRow = z.infer<typeof importDraftRowSchema>;
export type CreateImportDraftRevisionCommand = z.infer<
  typeof createImportDraftRevisionCommandSchema
>;
export type SubmitImportDraftRevisionCommand = z.infer<
  typeof submitImportDraftRevisionCommandSchema
>;
export type ReviseImportDraftCommand = z.infer<typeof reviseImportDraftCommandSchema>;
