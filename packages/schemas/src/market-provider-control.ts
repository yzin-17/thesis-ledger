import { z } from 'zod';
import { effectiveProviderPolicyV3Schema } from './market-route-v3.js';
import { marketPolicyClientResponseSchema } from './market-client-projections.js';
import { omitUndefinedDeep } from './exact-optional.js';

const identity = {
  contractVersion: z.literal(3),
  consumer: z.literal('thesis-ledger'),
  providerId: z.string().min(1),
  requestId: z.string().min(1),
};
export const marketProviderConfigResponseSchema = z.strictObject({
  ...identity,
  enabled: z.boolean(),
  configured: z.boolean(),
  credentialConfigured: z.boolean(),
  credentialSource: z.enum(['control', 'environment', 'none', 'built_in']),
  credentialFieldsConfigured: z.record(z.string(), z.boolean()),
  credentialMethod: z.string().nullable(),
  configVersion: z.number().int().nonnegative(),
  settings: z.record(z.string(), z.unknown()),
  secretKeyVersion: z.string().nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
  effective: effectiveProviderPolicyV3Schema.nullable(),
});
export const marketProviderTestResponseSchema = z
  .strictObject({
    ...identity,
    status: z.enum(['healthy', 'degraded', 'unconfigured']),
    credentialConfigured: z.boolean(),
    capabilityResults: z.record(
      z.string(),
      z.strictObject({
        status: z.enum(['healthy', 'unavailable', 'unconfigured']),
        readOnly: z.literal(true),
        attempted: z.boolean(),
        errorCode: z.string().optional(),
        latencyMs: z.number().int().nonnegative().optional(),
      }),
    ),
  })
  .transform(omitUndefinedDeep);
export type MarketProviderTestResponse = z.infer<typeof marketProviderTestResponseSchema>;
export const marketProviderRemovalProjectionSchema = z
  .object({
    providerId: z.string().min(1),
    removed: z.boolean(),
    pending: z.boolean().optional(),
    routeDiff: z.array(z.unknown()),
    policy: marketPolicyClientResponseSchema,
  })
  .refine(
    (value) =>
      !value.removed ||
      (!value.pending && value.policy.syncState === 'applied' && !value.policy.effectiveStale),
    '移除成功必须绑定当前生效策略',
  );
