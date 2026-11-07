import { z } from 'zod';

export const backgroundQuoteRequestSchema = z.strictObject({
  contractVersion: z.literal(3),
  consumer: z.literal('thesis-ledger'),
  requestId: z.string().min(1),
  symbol: z.string().min(1),
  assetType: z.enum(['STOCK', 'ETF', 'INDEX']),
});
export const backgroundQuotePlanSchema = backgroundQuoteRequestSchema.extend({
  generation: z.string().regex(/^[a-f0-9]{64}$/),
  policyRevision: z.number().int().nonnegative(),
  acquisition: z.enum(['public-snapshot', 'blocked']),
  reason: z.string().nullable(),
  target: z
    .strictObject({
      providerId: z.string(),
      upstreamSource: z.string(),
      routeIndex: z.number().int().nonnegative(),
    })
    .nullable(),
  minIntervalSeconds: z.number().int().positive().nullable(),
  sourceUpdateIntervalSeconds: z.number().positive().nullable(),
});
export type BackgroundQuoteRequest = z.infer<typeof backgroundQuoteRequestSchema>;
export type BackgroundQuotePlan = z.infer<typeof backgroundQuotePlanSchema>;

export function correlateBackgroundQuotePlan(request: BackgroundQuoteRequest, raw: unknown) {
  const plan = backgroundQuotePlanSchema.parse(raw);
  for (const field of ['requestId', 'symbol', 'assetType'] as const)
    if (plan[field] !== request[field]) throw new Error('后台报价计划未绑定请求');
  if (
    plan.acquisition === 'public-snapshot' &&
    (plan.assetType !== 'ETF' ||
      !/^\d{6}\.(SH|SZ)$/.test(plan.symbol) ||
      plan.target?.providerId !== 'tencent' ||
      plan.target.upstreamSource !== 'tencent' ||
      plan.minIntervalSeconds !== 600 ||
      plan.reason !== null)
  )
    throw new Error('后台报价计划超出已验证来源范围');
  return plan;
}
