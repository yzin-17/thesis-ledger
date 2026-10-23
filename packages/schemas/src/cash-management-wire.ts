import { z } from 'zod';
import { currencyCodeSchema, nonNegativeDecimalStringSchema } from './monetary-values.js';

export const cashBalanceObservationInputSchema = z
  .object({
    accountId: z.uuid(),
    amount: nonNegativeDecimalStringSchema,
    currency: currencyCodeSchema.optional(),
    capturedAt: z.iso.datetime(),
    source: z.literal('manual').default('manual'),
  })
  .strict();

export const cashBalanceObservationResponseSchema = z
  .object({
    accountId: z.uuid(),
    amount: nonNegativeDecimalStringSchema,
    currency: currencyCodeSchema.optional(),
    sourceOfTruth: z.literal('ledger'),
  })
  .strict();

export type CashBalanceObservationInput = z.infer<typeof cashBalanceObservationInputSchema>;
