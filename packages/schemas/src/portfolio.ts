import { z } from 'zod';

export const accountInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  source: z.enum(['manual', 'alipay', 'ths', 'broker']),
  type: z.enum(['securities', 'fund', 'cash', 'shadow']),
  broker: z.string().trim().max(80).optional(),
  currency: z.enum(['CNY', 'HKD', 'USD']),
});

export const positionInputSchema = z.object({
  accountId: z.uuid(),
  symbol: z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/),
  quantity: z.number().finite().positive(),
  costPrice: z.number().finite().nonnegative(),
  source: z.enum(['manual', 'screenshot', 'migration']),
});

export const importRowSchema = z.object({
  rawSymbol: z.string(),
  rawName: z.string().optional(),
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
  source: z.enum(['alipay', 'ths', 'broker', 'unknown']),
  sourceConfidence: z.number().min(0).max(1),
  status: z.enum(['pending', 'reviewed', 'committed', 'cancelled']),
  idempotencyKey: z.string().min(16),
  rows: z.array(importRowSchema),
  createdAt: z.iso.datetime({ offset: true }),
});

export type ImportDraft = z.infer<typeof importDraftSchema>;
