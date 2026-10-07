import { z } from 'zod';
import {
  decimalStringSchema,
  ledgerCommandSourceSchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
} from './ledger-contract.js';

export const baselineReconciliationRuleVersion = 1 as const;

export const baselineReconciliationConflictReasons = [
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

export const baselineReconciliationMatchBasis = [
  'ACCOUNT_MATCH',
  'SYMBOL_MATCH',
  'EXECUTION_BEFORE_BASELINE',
  'CHRONOLOGICAL_PREFIX',
  'REPLAYED_CHECKPOINTS',
] as const;

const baselineReconciliationStatusSchema = z.enum(['PARTIAL', 'MATCHED', 'CONFLICTED']);
const candidateStatusSchema = z.enum(['AVAILABLE', 'CONFLICTED']);

const baselineReconciliationCandidateSchema = z
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
    status: candidateStatusSchema,
    matchBasis: z.array(z.enum(baselineReconciliationMatchBasis)).min(1),
    conflictReasons: z.array(z.enum(baselineReconciliationConflictReasons)),
  })
  .strict();

const baselineReconciliationCheckpointSchema = z
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
    status: baselineReconciliationStatusSchema,
    conflictReasons: z.array(z.enum(baselineReconciliationConflictReasons)),
  })
  .strict();

export const baselineReconciliationCandidatesResponseSchema = z
  .object({
    accountId: z.uuid(),
    ruleVersion: z.literal(baselineReconciliationRuleVersion),
    checkpoints: z.array(baselineReconciliationCheckpointSchema),
    candidates: z.array(baselineReconciliationCandidateSchema),
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

export const confirmBaselineReconciliationCommandSchema = z
  .object({
    command: z.literal('CONFIRM_BASELINE_RECONCILIATION'),
    accountId: z.uuid(),
    baselineFactId: z.uuid(),
    executionFactIds: z.array(z.uuid()).min(1),
    coveredQuantity: positiveDecimalStringSchema,
    coveredCost: nonNegativeDecimalStringSchema,
    ruleVersion: z.literal(baselineReconciliationRuleVersion),
    expectedLedgerRevision: z.string().regex(/^\d+$/),
    source: ledgerCommandSourceSchema,
    actorId: z.string().trim().min(1).max(255),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict()
  .superRefine(uniqueExecutionFactIds);

const baselineReconciliationCorrectionShape = {
  accountId: z.uuid(),
  expectedLedgerRevision: z.string().regex(/^\d+$/),
  supersedesEventId: z.uuid(),
  source: ledgerCommandSourceSchema,
  actorId: z.string().trim().min(1).max(255),
  reason: z.string().trim().min(1).max(1000),
};

export const voidBaselineReconciliationCommandSchema = z
  .object({
    command: z.literal('VOID_BASELINE_RECONCILIATION'),
    ...baselineReconciliationCorrectionShape,
  })
  .strict();

export const restoreBaselineReconciliationCommandSchema = z
  .object({
    command: z.literal('RESTORE_BASELINE_RECONCILIATION'),
    ...baselineReconciliationCorrectionShape,
  })
  .strict();

export const baselineReconciliationCommandSchema = z.discriminatedUnion('command', [
  confirmBaselineReconciliationCommandSchema,
  voidBaselineReconciliationCommandSchema,
  restoreBaselineReconciliationCommandSchema,
]);

export type BaselineReconciliationConflictReason =
  (typeof baselineReconciliationConflictReasons)[number];
export type BaselineReconciliationMatchBasis =
  (typeof baselineReconciliationMatchBasis)[number];
export type BaselineReconciliationCandidate = z.infer<
  typeof baselineReconciliationCandidateSchema
>;
export type BaselineReconciliationCheckpoint = z.infer<
  typeof baselineReconciliationCheckpointSchema
>;
export type BaselineReconciliationCandidatesResponse = z.infer<
  typeof baselineReconciliationCandidatesResponseSchema
>;
export type ConfirmBaselineReconciliationCommand = z.infer<
  typeof confirmBaselineReconciliationCommandSchema
>;
export type VoidBaselineReconciliationCommand = z.infer<
  typeof voidBaselineReconciliationCommandSchema
>;
export type RestoreBaselineReconciliationCommand = z.infer<
  typeof restoreBaselineReconciliationCommandSchema
>;
export type BaselineReconciliationCommand = z.infer<typeof baselineReconciliationCommandSchema>;
