import { z } from 'zod';

export const accountInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  institution: z.string().trim().max(80).optional(),
  type: z.enum(['securities', 'fund', 'cash']),
  mode: z.enum(['actual', 'shadow']).default('actual'),
  currency: z.enum(['CNY', 'HKD', 'USD']),
});

export const positionInputSchema = z.object({
  accountId: z.uuid(),
  instrumentId: z.uuid().optional(),
  symbol: z.string().regex(/^\d{6}\.(SH|SZ|BJ|OF)$/),
  quantity: z.number().finite().nonnegative(),
  costPrice: z.number().finite().nonnegative(),
  source: z.enum(['manual', 'screenshot', 'migration']),
  assetName: z.string().trim().max(120).optional(),
  assetType: z.enum(['stock', 'etf', 'fund']).optional(),
});

export const importRowSchema = z.object({
  rawSymbol: z.string(),
  rawName: z.string().optional(),
  assetType: z.enum(['stock', 'etf', 'fund']).optional(),
  symbol: z.string().optional(),
  matchStatus: z.enum(['matched', 'ambiguous', 'unmatched']),
  matchCandidates: z.array(z.string()).default([]),
  quantity: z.number().finite().nonnegative().optional(),
  costPrice: z.number().finite().nonnegative().optional(),
  marketValue: z.number().finite().nonnegative().optional(),
  marketPrice: z.number().finite().nonnegative().optional(),
  profit: z.number().finite().optional(),
  profitRate: z.number().finite().optional(),
  confidence: z.number().min(0).max(1),
  rawText: z.record(z.string(), z.string()).default({}),
  issues: z.array(z.string()),
});

export const importDraftSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  source: z.enum(['alipay', 'ths', 'broker', 'bank', 'fund-platform', 'unknown']),
  sourceConfidence: z.number().min(0).max(1),
  status: z.enum(['pending', 'reviewed', 'committed', 'cancelled']),
  idempotencyKey: z.string().min(16),
  rows: z.array(importRowSchema),
  baselineHash: z.string().min(16).optional(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type ImportDraft = z.infer<typeof importDraftSchema>;
