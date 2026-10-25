import { z } from 'zod';
import { marketProviderProbeRouteSchema } from './market-provider-control.js';
import { marketProviderAccountLevelSchema } from './market-account-access.js';
import { desiredProviderPolicyV3Schema } from './market-route-v3.js';
const envelope = {
  contractVersion: z.literal(3).optional(),
  consumer: z.literal('thesis-ledger').optional(),
  requestId: z.string().trim().min(1).optional(),
};
const credentials = z.strictObject({
  method: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
});
export const marketProviderSaveInputSchema = z
  .strictObject({
    ...envelope,
    enabled: z.boolean().optional(),
    expectedConfigVersion: z.number().int().nonnegative().optional(),
    credentials: credentials.optional(),
    clearCredentials: z.boolean().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => !(value.clearCredentials && value.credentials));
export const marketProviderTestInputSchema = z.strictObject({
  ...envelope,
  credentials: credentials.optional(),
  route: marketProviderProbeRouteSchema.optional(),
  purpose: z.enum(['capability_read', 'account_access']).optional(),
  accountLevel: marketProviderAccountLevelSchema.optional(),
});
export const marketPolicySaveInputSchema = desiredProviderPolicyV3Schema
  .extend({
    expectedRevision: z.number().int().nonnegative(),
  })
  .refine((value) => value.revision === value.expectedRevision + 1, '保存修订必须紧接预期修订');
export type MarketProviderSaveInput = z.input<typeof marketProviderSaveInputSchema>;
export type MarketProviderTestInput = z.input<typeof marketProviderTestInputSchema>;
export type MarketPolicySaveInput = z.input<typeof marketPolicySaveInputSchema>;
