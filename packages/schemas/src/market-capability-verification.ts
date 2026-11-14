import { z } from 'zod';

/** 验证通过由同一精确能力与配置上下文的一次完整成功支持。 */
export const marketCapabilityVerificationSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('unverified') }),
  z.strictObject({
    state: z.literal('verified'),
    verifiedAt: z.iso.datetime({ offset: true }),
    configVersion: z.number().int().nonnegative(),
    evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
]);
