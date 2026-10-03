import { z } from 'zod';

/** An immutable Market-owned acquisition, not a Run snapshot or a provider capability claim. */
export const marketFrozenWindowRefV3Schema = z.strictObject({
  version: z.literal('market-frozen-window-v1'),
  identityFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  responseHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type MarketFrozenWindowRefV3 = z.infer<typeof marketFrozenWindowRefV3Schema>;
