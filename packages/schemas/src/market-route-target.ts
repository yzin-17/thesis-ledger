import { z } from 'zod';

/** 当前 Market 路由目标的稳定身份。 */
export const marketRouteTargetSchema = z.object({
  providerId: z.string().min(1),
  upstreamSource: z.string().min(1),
});
export type MarketRouteTarget = z.infer<typeof marketRouteTargetSchema>;
