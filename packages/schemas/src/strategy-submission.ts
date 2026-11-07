import { z } from 'zod';
import { backtestRunPreparationRequestV3Schema } from './backtest-run-preparation-v3.js';
import { backtestNavPreparationRequestV3Schema } from './backtest-nav-preparation-v3.js';
import { optimizationRunPreparationRequestSchema } from './optimization-run-preparation.js';
import {
  optimizationSubmissionSettingsSchema,
  validateOptimizationExperimentCreate,
} from './strategy-optimization.js';

export const strategySubmissionInputSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('ordinary'),
      preparation: backtestRunPreparationRequestV3Schema,
    }),
    z.strictObject({ kind: z.literal('nav'), preparation: backtestNavPreparationRequestV3Schema }),
    z.strictObject({
      kind: z.literal('optimization'),
      preparation: optimizationRunPreparationRequestSchema,
      settings: optimizationSubmissionSettingsSchema,
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.kind === 'optimization')
      validateOptimizationExperimentCreate(
        {
          ...value.settings,
          ...value.preparation.target,
          runConfig: value.preparation.intent.runConfig,
          idempotencyKey: value.preparation.intent.requestId,
        },
        ctx,
      );
  });
export type StrategySubmissionInput = z.infer<typeof strategySubmissionInputSchema>;
export const strategySubmissionIdSchema = z.uuid();
export const strategySubmissionReceiptSchema = z.object({
  id: strategySubmissionIdSchema,
  kind: z.enum(['ordinary', 'nav', 'optimization']),
  state: z.enum([
    'queued',
    'preparing',
    'awaiting_confirmation',
    'ready',
    'creating',
    'submitted',
    'blocked',
  ]),
  createdAt: z.iso.datetime(),
  prepared: z.json().nullable(),
  outcome: z
    .object({
      id: z.uuid().optional(),
      reason: z.string().optional(),
      diagnostics: z.array(z.unknown()).optional(),
    })
    .nullable(),
});
export type StrategySubmissionReceipt = z.infer<typeof strategySubmissionReceiptSchema>;
