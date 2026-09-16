import { z } from 'zod';

const isoDateTime = z.iso.datetime({ offset: true });
const routeTargetSchema = z.object({
  providerId: z.string().min(1),
  upstreamSource: z.string().min(1),
});

export const routeTargetV2Schema = routeTargetSchema;
export type RouteTargetV2 = z.infer<typeof routeTargetV2Schema>;

export const providerRouteMatrixV2Schema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.array(routeTargetSchema).max(2).superRefine((targets, context) => {
      const seen = new Set<string>();
      targets.forEach((target, index) => {
        const key = `${target.providerId}\u0000${target.upstreamSource}`;
        if (seen.has(key)) {
          context.addIssue({
            code: 'custom',
            path: [index],
            message: 'RouteTarget 不能重复',
          });
        }
        seen.add(key);
      });
    }),
  ),
);

export type ProviderRouteMatrixV2 = z.infer<typeof providerRouteMatrixV2Schema>;

const controlEnvelopeV2Schema = z.object({
  contractVersion: z.literal(2),
  consumer: z.literal('thesis-ledger'),
  requestId: z.string().min(1),
});

export const desiredProviderPolicyV2Schema = controlEnvelopeV2Schema.extend({
  revision: z.number().int().positive(),
  enabled: z.boolean(),
  routes: providerRouteMatrixV2Schema,
});
export type DesiredProviderPolicyV2 = z.infer<typeof desiredProviderPolicyV2Schema>;

const routeIndexSchema = z.number().int().nonnegative();
const eligibleRouteTargetV2Schema = routeTargetSchema.extend({
  routeIndex: routeIndexSchema,
});

export const effectiveRouteTargetV2Schema = eligibleRouteTargetV2Schema.extend({
  routeIndex: routeIndexSchema,
  configured: z.boolean(),
  enabled: z.boolean(),
  available: z.boolean(),
  eligible: z.boolean(),
  health: z.string(),
  circuit: z.string(),
  reason: z.string().nullable().optional(),
});

export const effectiveProviderPolicyV2Schema = controlEnvelopeV2Schema.extend({
  revision: z.number().int().nonnegative(),
  sourceDesiredRevision: z.number().int().nonnegative(),
  enabled: z.boolean(),
  routes: providerRouteMatrixV2Schema,
  routeStatus: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({
        targets: z.array(effectiveRouteTargetV2Schema),
        eligibleTargets: z.array(eligibleRouteTargetV2Schema),
        reason: z.string().nullable().optional(),
      }),
    ),
  ),
  appliedAt: isoDateTime,
});
export type EffectiveProviderPolicyV2 = z.infer<typeof effectiveProviderPolicyV2Schema>;
