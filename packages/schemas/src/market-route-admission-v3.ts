import { z } from 'zod';
import { marketRouteKeyV3Schema } from './market-route-v3.js';
import { marketRouteTargetSchema } from './market-route-target.js';

const text = z.string().trim().min(1);
/** DSA 已核验的只读准入投影；不包含凭据内容或审核人身份。 */
export const marketRouteAdmissionV3Schema = z
  .strictObject({
    consumer: z.literal('thesis-ledger'),
    routeKey: marketRouteKeyV3Schema,
    target: marketRouteTargetSchema.strict(),
    status: z.literal('admitted'),
    admissionState: z.literal('admitted'),
    evidenceRef: text,
    evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    scopeSymbols: z.array(text).min(1),
    scopeDateFrom: z.iso.date(),
    scopeDateTo: z.iso.date(),
    adapterRevision: text,
    sourceRevision: text,
    credentialRevision: text,
    validFrom: z.iso.datetime({ offset: true }),
    validUntil: z.iso.datetime({ offset: true }).nullable(),
    recordVersion: z.number().int().positive(),
    recordedAt: z.iso.datetime({ offset: true }),
    invalidatedAt: z.null(),
    invalidationReason: z.null(),
  })
  .superRefine((value, ctx) => {
    if (value.scopeDateFrom > value.scopeDateTo) {
      ctx.addIssue({ code: 'custom', path: ['scopeDateTo'], message: '准入日期范围无效' });
    }
    if (value.validUntil === null && !(value.routeKey.kind === 'data' &&
      value.routeKey.market === 'CN' && ['STOCK', 'ETF'].includes(value.routeKey.assetType) &&
      value.routeKey.capability === 'HISTORICAL_EXECUTION_CONTEXT' &&
      value.target.providerId === 'historical-execution-archive' &&
      value.target.upstreamSource === 'qualified-cn-execution')) {
      ctx.addIssue({ code: 'custom', path: ['validUntil'], message: '只有本地历史执行归档允许按修订有效' });
    }
    if (value.validUntil !== null && Date.parse(value.validFrom) >= Date.parse(value.validUntil)) {
      ctx.addIssue({ code: 'custom', path: ['validUntil'], message: '准入有效期无效' });
    }
    if (new Set(value.scopeSymbols).size !== value.scopeSymbols.length) {
      ctx.addIssue({ code: 'custom', path: ['scopeSymbols'], message: '准入标的重复' });
    }
  });

/** 实时、事件与净值来源继续使用有限时间有效期。 */
export const timedMarketRouteAdmissionV3Schema = marketRouteAdmissionV3Schema.safeExtend({
  validUntil: z.iso.datetime({ offset: true }),
});
