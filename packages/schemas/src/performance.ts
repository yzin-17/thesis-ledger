import { z } from 'zod';
import { portfolioModeSchema } from './api.js';

export const performanceSnapshotCaptureInputSchema = z.object({
  accountId: z.uuid().optional(),
  capturedAt: z.iso.datetime({ offset: true }).optional(),
  mode: portfolioModeSchema.optional(),
});

export const performanceCalculateInputSchema = z.object({
  valuations: z.array(
    z.object({
      date: z.iso.datetime({ offset: true }),
      value: z.number().finite(),
      externalFlow: z.number().finite().optional(),
    }),
  ),
  cashFlows: z.array(
    z.object({ date: z.iso.datetime({ offset: true }), amount: z.number().finite() }),
  ),
});

export const performanceAllocationInputSchema = z.object({
  positions: z.array(z.object({ category: z.string().min(1), marketValue: z.number().finite() })),
  targets: z.record(z.string(), z.number().finite()).optional(),
});

export const performanceTargetsInputSchema = z.object({
  scope: z.enum(['account', 'portfolio']),
  accountId: z.uuid().optional(),
  targets: z.record(z.string(), z.number().finite()),
});
