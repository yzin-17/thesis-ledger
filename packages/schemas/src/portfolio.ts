import { z } from 'zod';
import { decimalStringSchema, nonNegativeDecimalStringSchema } from './ledger-v2.js';

export const accountTypeSchema = z.enum(['securities', 'fund', 'cash']);
export const accountModeSchema = z.enum(['actual', 'shadow']);
export const accountCurrencySchema = z.enum(['CNY', 'HKD', 'USD']);

export const accountInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  institution: z.string().trim().max(80).optional(),
  type: accountTypeSchema,
  mode: accountModeSchema.default('actual'),
  currency: accountCurrencySchema,
});

export const accountResponseSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    institution: z.string().nullable(),
    type: accountTypeSchema,
    mode: accountModeSchema,
    currency: accountCurrencySchema,
    active: z.boolean(),
  })
  .passthrough();

export const accountsResponseSchema = z.array(accountResponseSchema);
export type AccountResponse = z.infer<typeof accountResponseSchema>;
export type AccountMode = z.infer<typeof accountModeSchema>;

export const accountPermanentDeletionErrorCodeSchema = z.literal('ACCOUNT_IN_USE');
export type AccountPermanentDeletionErrorCode = z.infer<
  typeof accountPermanentDeletionErrorCodeSchema
>;

export const positionInputSchema = z.object({
  accountId: z.uuid(),
  instrumentId: z.uuid().optional(),
  symbol: z.string().regex(/^\d{6}\.(SH|SZ|BJ|OF)$/),
  quantity: nonNegativeDecimalStringSchema,
  costPrice: nonNegativeDecimalStringSchema,
  source: z.enum(['manual', 'screenshot', 'migration']),
  assetName: z.string().trim().max(120).optional(),
  assetType: z.enum(['stock', 'etf', 'fund']).optional(),
  occurredAt: z.iso.datetime().optional(),
});

export const importRowSchema = z.object({
  rowId: z.string().trim().min(1).max(255).optional(),
  rawSymbol: z.string(),
  rawName: z.string().optional(),
  assetType: z.enum(['stock', 'etf', 'fund']).optional(),
  symbol: z.string().optional(),
  matchStatus: z.enum(['matched', 'ambiguous', 'unmatched']),
  matchCandidates: z.array(z.string()).default([]),
  quantity: nonNegativeDecimalStringSchema.optional(),
  costPrice: nonNegativeDecimalStringSchema.optional(),
  marketValue: nonNegativeDecimalStringSchema.optional(),
  marketPrice: nonNegativeDecimalStringSchema.optional(),
  profit: decimalStringSchema.optional(),
  profitRate: decimalStringSchema.optional(),
  confidence: z.number().min(0).max(1),
  rawText: z.record(z.string(), z.string()).default({}),
  issues: z.array(z.string()),
});

export const importDraftSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  source: z.enum(['alipay', 'ths', 'broker', 'bank', 'fund-platform', 'unknown']),
  sourceConfidence: z.number().min(0).max(1),
  scope: z.enum(['FULL', 'PARTIAL']).default('FULL'),
  status: z.enum(['pending', 'reviewed', 'committed', 'partial', 'cancelled']),
  idempotencyKey: z.string().min(16),
  rows: z.array(importRowSchema),
  baselineHash: z.string().min(16).optional(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type ImportDraft = z.infer<typeof importDraftSchema>;
