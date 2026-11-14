import { z } from 'zod';
import { marketChartBarsRequestV3Schema } from './market-chart-wire-v3.js';
import { marketRouteKeyIdV3 } from './market-route-v3.js';

/** 只读控制请求复用交互行情身份，不能携带研究或可成交假设。 */
export const marketBarCacheContextRequestV3Schema = marketChartBarsRequestV3Schema.safeExtend({
  consumer: z.literal('thesis-ledger'),
  capability: z.enum(['DAILY_BAR', 'MINUTE_BAR']),
  tradabilityMode: z.never().optional(),
}).superRefine((value, context) => {
  if (value.capability !== value.routeKey.capability)
    context.addIssue({ code: 'custom', message: 'K线缓存能力必须匹配精确路由' });
  if (value.symbol !== value.symbol.toUpperCase())
    context.addIssue({ code: 'custom', message: 'K线缓存标的必须规范化' });
  const suffix = { CN: /^\d{6}\.(SH|SZ|BJ)$/, HK: /^\d{5}\.HK$/, US: /^[A-Z][A-Z0-9.-]*\.US$/ }[value.routeKey.market];
  if (!suffix.test(value.symbol) || !['STOCK', 'ETF'].includes(value.routeKey.assetType))
    context.addIssue({ code: 'custom', message: 'K线缓存标的、市场或资产类型不匹配' });
});

export const marketBarCacheContextResponseV3Schema = marketBarCacheContextRequestV3Schema.safeExtend({
  generation: z.string().regex(/^[a-f0-9]{64}$/),
  policyRevision: z.number().int().nonnegative(),
  ready: z.boolean(),
  reason: z.enum(['disabled', 'not_selected', 'not_eligible', 'control_unavailable']).nullable(),
}).superRefine((value, context) => {
  if (value.ready === (value.reason !== null))
    context.addIssue({ code: 'custom', message: 'K线缓存控制状态与原因不匹配' });
});

export type MarketBarCacheContextRequestV3 = z.infer<typeof marketBarCacheContextRequestV3Schema>;
export type MarketBarCacheContextResponseV3 = z.infer<typeof marketBarCacheContextResponseV3Schema>;

export function correlateMarketBarCacheContextV3(request: MarketBarCacheContextRequestV3, raw: unknown) {
  const response = marketBarCacheContextResponseV3Schema.parse(raw);
  const matches = ['requestId', 'symbol', 'capability', 'purpose', 'start', 'end'].every(
    (name) => response[name as keyof typeof response] === request[name as keyof typeof request],
  ) && marketRouteKeyIdV3(response.routeKey) === marketRouteKeyIdV3(request.routeKey)
    && response.routeTarget.providerId === request.routeTarget.providerId
    && response.routeTarget.upstreamSource === request.routeTarget.upstreamSource
    && response.routeTarget.routeIndex === request.routeTarget.routeIndex;
  if (!matches) throw new Error('K线缓存控制响应未绑定精确请求');
  return response;
}
