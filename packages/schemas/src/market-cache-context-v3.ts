import { z } from 'zod';
import { marketRouteKeyV3Schema } from './market-route-v3.js';

const identity = {
  contractVersion: z.literal(3), consumer: z.literal('thesis-ledger'),
  requestId: z.string().min(1).refine((value) => value.trim() === value),
  symbol: z.string().min(1).max(64).refine((value) => value.trim() === value && value.toUpperCase() === value),
};
export const marketCacheContextRequestV3Schema = z.discriminatedUnion('capability', [
  z.strictObject({ ...identity, capability: z.literal('REALTIME_QUOTE'),
    assetType: z.enum(['STOCK', 'ETF', 'INDEX']).optional() }),
  z.strictObject({ ...identity, capability: z.literal('FUND_NAV') }),
  z.strictObject({ ...identity, capability: z.literal('FUND_NAV_HISTORY') }),
  z.strictObject({ ...identity, capability: z.literal('FUND_HOLDINGS') }),
  z.strictObject({ ...identity, capability: z.literal('CHIP_SUMMARY') }),
]);
export const marketCacheContextResponseV3Schema = z.strictObject({
  ...identity,
  capability: z.enum(['REALTIME_QUOTE', 'FUND_NAV', 'FUND_NAV_HISTORY', 'FUND_HOLDINGS', 'CHIP_SUMMARY']),
  routeKey: marketRouteKeyV3Schema.options[1],
  generation: z.string().regex(/^[a-f0-9]{64}$/),
  policyRevision: z.number().int().nonnegative(),
  ready: z.boolean(),
  reason: z.enum(['disabled', 'not_selected', 'not_eligible', 'control_unavailable']).nullable(),
}).superRefine((value, context) => {
  if (value.ready === (value.reason !== null))
    context.addIssue({ code: 'custom', message: '可用缓存上下文与原因不匹配' });
  if (value.routeKey.capability !== value.capability)
    context.addIssue({ code: 'custom', message: '缓存上下文能力不匹配' });
  if (value.capability.startsWith('FUND_') && value.routeKey.assetType !== 'MUTUAL_FUND')
    context.addIssue({ code: 'custom', message: '基金缓存上下文资产类型无效' });
  if (value.capability === 'CHIP_SUMMARY' && value.routeKey.assetType !== 'STOCK')
    context.addIssue({ code: 'custom', message: '筹码缓存上下文资产类型无效' });
});
export type MarketCacheContextRequestV3 = z.infer<typeof marketCacheContextRequestV3Schema>;
export type MarketCacheContextResponseV3 = z.infer<typeof marketCacheContextResponseV3Schema>;

export function correlateMarketCacheContextV3(request: MarketCacheContextRequestV3, raw: unknown) {
  const response = marketCacheContextResponseV3Schema.parse(raw);
  for (const name of ['requestId', 'symbol', 'capability'] as const)
    if (response[name] !== request[name]) throw new Error('缓存上下文响应未绑定请求');
  if ('assetType' in request && request.assetType && response.routeKey.assetType !== request.assetType)
    throw new Error('缓存上下文资产类型不匹配');
  return response;
}
