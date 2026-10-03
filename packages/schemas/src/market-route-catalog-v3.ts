import { z } from 'zod';
import {
  marketRouteCapabilityV3Schema,
  marketRouteKeyIdV3,
  type MarketRouteCapabilityV3,
} from './market-route-v3.js';
import { marketRouteTargetSchema } from './market-route-target.js';

/** Independent Control endpoint. Data contract negotiation remains on its own wire. */
export const marketRouteCatalogGetEndpointV3 =
  '/api/v3/thesis-ledger/control/routes/capabilities?contractVersion=3';

const catalogEntry = marketRouteCapabilityV3Schema.extend({
  target: marketRouteTargetSchema.strict(),
});

const entries = z.array(catalogEntry).superRefine((capabilities, context) => {
  const seen = new Set<string>();
  capabilities.forEach((capability, index) => {
    const id = JSON.stringify([
      marketRouteKeyIdV3(capability.key),
      capability.target.providerId,
      capability.target.upstreamSource,
    ]);
    if (seen.has(id)) {
      context.addIssue({
        code: 'custom',
        path: [index],
        message: '精确路由能力目录不能重复登记相同 key 与 target',
      });
    }
    seen.add(id);
  });
});

/** `partial` rows remain descriptive evidence, but cannot be consumed as readiness. */
export const marketRouteCatalogV3Schema = z.strictObject({
  contractVersion: z.literal(3),
  consumer: z.literal('thesis-ledger'),
  catalogRevision: z.number().int().positive(),
  generatedAt: z.iso.datetime({ offset: true }),
  integrity: z.enum(['complete', 'partial']),
  entries,
});
export type MarketRouteCatalogV3 = z.infer<typeof marketRouteCatalogV3Schema>;

/** Missing and incomplete catalogs expose no usable capability rows. */
export const marketRouteCatalogCapabilitiesV3 = (
  catalog: MarketRouteCatalogV3 | null | undefined,
): MarketRouteCapabilityV3[] => (catalog?.integrity === 'complete' ? catalog.entries : []);
