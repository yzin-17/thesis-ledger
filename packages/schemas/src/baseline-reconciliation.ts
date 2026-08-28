import { z } from 'zod';
import {
  decimalStringSchema,
  ledgerCommandSourceSchemaV2,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
} from './ledger-v2.js';

export const baselineReconciliationRuleVersionV2 = 1 as const;

export const baselineReconciliationConflictReasonsV2 = [
  'BASELINE_TIME_UNKNOWN',
  'MISSING_BASELINE_COST',
  'EXECUTION_TIME_UNKNOWN',
  'EXECUTION_NOT_FOUND',
  'EXECUTION_SCOPE_MISMATCH',
  'EXECUTION_AFTER_BASELINE',
  'EXECUTION_CURRENCY_MISMATCH',
  'CHARGE_CURRENCY_MISMATCH',
  'EXECUTION_OVERSELL',
  'DUPLICATE_EXECUTION_COVERAGE',
  'NEGATIVE_REMAINING_QUANTITY',
  'NEGATIVE_REMAINING_COST',
] as const;

export const baselineReconciliationMatchBasisV2 = [
  'ACCOUNT_MATCH',
  'SYMBOL_MATCH',
  'EXECUTION_BEFORE_BASELINE',
  'CHRONOLOGICAL_PREFIX',
  'REPLAYED_CHECKPOINTS',
] as const;

const baselineReconciliationStatusSchemaV2 = z.enum(['PARTIAL', 'MATCHED', 'CONFLICTED']);
const candidateStatusSchemaV2 = z.enum(['AVAILABLE', 'CONFLICTED']);

const baselineReconciliationCandidateSchemaV2 = z
  .object({
    candidateId: z.string().trim().min(1).max(200),
    baselineFactId: z.uuid(),
    symbol: z.string().trim().min(1),
    executionFactIds: z.array(z.uuid()).min(1),
    observedQuantity: nonNegativeDecimalStringSchema,
    observedCost: nonNegativeDecimalStringSchema.optional(),
    coveredQuantity: decimalStringSchema,
    coveredCost: decimalStringSchema,
    remainingQuantity: decimalStringSchema,
    remainingCost: decimalStringSchema.optional(),
    status: candidateStatusSchemaV2,
    matchBasis: z.array(z.enum(baselineReconciliationMatchBasisV2)).min(1),
    conflictReasons: z.array(z.enum(baselineReconciliationConflictReasonsV2)),
  })
  .strict();

const baselineReconciliationCheckpointSchemaV2 = z
  .object({
    baselineFactId: z.uuid(),
    symbol: z.string().trim().min(1),
    occurredAt: z.union([z.iso.datetime(), z.iso.date()]).nullable(),
    observedQuantity: nonNegativeDecimalStringSchema,
    observedCost: nonNegativeDecimalStringSchema.optional(),
    reconciledExecutionFactIds: z.array(z.uuid()),
    reconciledActualQuantity: decimalStringSchema,
    reconciledActualCost: decimalStringSchema,
    remainingQuantity: decimalStringSchema,
    remainingCost: decimalStringSchema.optional(),
    status: baselineReconciliationStatusSchemaV2,
    conflictReasons: z.array(z.enum(baselineReconciliationConflictReasonsV2)),
  })
  .strict();

export const baselineReconciliationCandidatesResponseSchemaV2 = z
  .object({
    accountId: z.uuid(),
    ruleVersion: z.literal(baselineReconciliationRuleVersionV2),
    checkpoints: z.array(baselineReconciliationCheckpointSchemaV2),
    candidates: z.array(baselineReconciliationCandidateSchemaV2),
  })
  .strict();

const uniqueExecutionFactIds = (
  command: { executionFactIds: string[] },
  context: z.RefinementCtx,
) => {
  if (new Set(command.executionFactIds).size !== command.executionFactIds.length)
    context.addIssue({
      code: 'custom',
      path: ['executionFactIds'],
      message: 'executionFactIds 不能重复',
    });
};

export const confirmBaselineReconciliationCommandSchemaV2 = z
  .object({
    command: z.literal('CONFIRM_BASELINE_RECONCILIATION'),
    accountId: z.uuid(),
    baselineFactId: z.uuid(),
    executionFactIds: z.array(z.uuid()).min(1),
    coveredQuantity: positiveDecimalStringSchema,
    coveredCost: nonNegativeDecimalStringSchema,
    ruleVersion: z.literal(baselineReconciliationRuleVersionV2),
    expectedLedgerRevision: z.string().regex(/^\d+$/),
    source: ledgerCommandSourceSchemaV2,
    actorId: z.string().trim().min(1).max(255),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict()
  .superRefine(uniqueExecutionFactIds);

const baselineReconciliationCorrectionShapeV2 = {
  accountId: z.uuid(),
  expectedLedgerRevision: z.string().regex(/^\d+$/),
  supersedesEventId: z.uuid(),
  source: ledgerCommandSourceSchemaV2,
  actorId: z.string().trim().min(1).max(255),
  reason: z.string().trim().min(1).max(1000),
};

export const voidBaselineReconciliationCommandSchemaV2 = z
  .object({
    command: z.literal('VOID_BASELINE_RECONCILIATION'),
    ...baselineReconciliationCorrectionShapeV2,
  })
  .strict();

export const restoreBaselineReconciliationCommandSchemaV2 = z
  .object({
    command: z.literal('RESTORE_BASELINE_RECONCILIATION'),
    ...baselineReconciliationCorrectionShapeV2,
  })
  .strict();

export const baselineReconciliationCommandSchemaV2 = z.discriminatedUnion('command', [
  confirmBaselineReconciliationCommandSchemaV2,
  voidBaselineReconciliationCommandSchemaV2,
  restoreBaselineReconciliationCommandSchemaV2,
]);

export type BaselineReconciliationConflictReasonV2 =
  (typeof baselineReconciliationConflictReasonsV2)[number];
export type BaselineReconciliationMatchBasisV2 =
  (typeof baselineReconciliationMatchBasisV2)[number];
export type BaselineReconciliationCandidateV2 = z.infer<
  typeof baselineReconciliationCandidateSchemaV2
>;
export type BaselineReconciliationCheckpointV2 = z.infer<
  typeof baselineReconciliationCheckpointSchemaV2
>;
export type BaselineReconciliationCandidatesResponseV2 = z.infer<
  typeof baselineReconciliationCandidatesResponseSchemaV2
>;
export type ConfirmBaselineReconciliationCommandV2 = z.infer<
  typeof confirmBaselineReconciliationCommandSchemaV2
>;
export type VoidBaselineReconciliationCommandV2 = z.infer<
  typeof voidBaselineReconciliationCommandSchemaV2
>;
export type RestoreBaselineReconciliationCommandV2 = z.infer<
  typeof restoreBaselineReconciliationCommandSchemaV2
>;
export type BaselineReconciliationCommandV2 = z.infer<typeof baselineReconciliationCommandSchemaV2>;
