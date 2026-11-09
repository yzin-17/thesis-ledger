import { z } from 'zod';

export const marketStaleReasonSchema = z.object({
  code: z.enum(['timeout', 'rate_limited', 'unauthorized', 'permission_denied', 'invalid_response', 'control_rejected', 'source_unavailable', 'unknown']),
  message: z.string().min(1),
  httpStatus: z.number().int().min(400).max(599).optional(),
});
export type MarketStaleReason = z.infer<typeof marketStaleReasonSchema>;

export const quoteStaleReasonSchema = marketStaleReasonSchema.extend({
  code: z.enum([
    ...marketStaleReasonSchema.shape.code.options,
    'market_time_aged', 'request_budget_cooldown', 'cache_unavailable',
    'refresh_in_progress', 'upstream_stale',
  ]),
});
export type QuoteStaleReason = z.infer<typeof quoteStaleReasonSchema>;
