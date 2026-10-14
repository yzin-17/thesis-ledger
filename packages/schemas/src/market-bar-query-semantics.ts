import { z } from 'zod';

/** 可执行日线的标准事实；覆盖、配置与本次结果仍分别验证。 */
export const marketBarQuerySemanticsV3Schema = z.strictObject({
  contractVersion: z.literal(3),
  operation: z.literal('query'),
  adjustment: z.enum(['none', 'qfq', 'hfq']),
  priceBasis: z.literal('provider-native'),
  readScope: z.literal('single-target-whole-window'),
  coverageValidation: z.literal('per-request'),
  transportProtocol: z.string().trim().min(1),
});
export type MarketBarQuerySemanticsV3 = z.infer<typeof marketBarQuerySemanticsV3Schema>;
