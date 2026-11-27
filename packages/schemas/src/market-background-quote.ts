import { z } from 'zod';

export const backgroundQuoteRequestSchema = z.strictObject({
  contractVersion: z.literal(1),
  consumer: z.literal('thesis-ledger'),
  requestId: z.string().min(1),
  symbol: z.string().min(1),
  assetType: z.enum(['STOCK', 'ETF', 'INDEX']),
});
export const backgroundQuotePlanSchema = backgroundQuoteRequestSchema.extend({
  generation: z.string().regex(/^[a-f0-9]{64}$/),
  policyRevision: z.number().int().nonnegative(),
  acquisition: z.enum(['public-snapshot', 'account-snapshot', 'blocked']),
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
  if (plan.acquisition === 'account-snapshot') {
    const futu = plan.target?.providerId === 'futu' && plan.target.upstreamSource === 'futu' &&
      /\.(HK|US)$/.test(plan.symbol);
    const hiThink = plan.target?.providerId === 'hithink' && plan.sourceUpdateIntervalSeconds === null &&
      ((plan.assetType === 'STOCK' && plan.target.upstreamSource === 'a-share-prices-snapshot' &&
        /^[0-9]{6}\.(SH|SZ|BJ)$/.test(plan.symbol)) ||
        (plan.assetType === 'ETF' && plan.target.upstreamSource === 'fund-market-snapshot' &&
          /^[0-9]{6}\.(SH|SZ)$/.test(plan.symbol)));
    if ((!futu && !hiThink) || plan.assetType === 'INDEX' ||
      plan.minIntervalSeconds !== (plan.assetType === 'ETF' ? 600 : 15) || plan.reason !== null)
      throw new Error('后台报价计划超出已确认账户范围');
  }
  return plan;
}
