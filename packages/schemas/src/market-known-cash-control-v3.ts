import { z } from 'zod';
import { marketDataRouteTargetPinV3Schema } from './market-data-wire-v3.js';
import { marketKnownCashControlIdentityV3Schema } from './market-known-cash-record-v3.js';
import {
  marketKnownCashRequestV3Schema,
  marketKnownCashErrorV3Schema,
  marketKnownCashEndpointV3,
  validateMarketKnownCashScopeV3,
} from './market-known-cash-wire-v3.js';
import { parseMarketPitEvidenceInstantV1 } from './market-pit-evidence-instant-v1.js';

export const marketKnownCashControlEndpointV3 = marketKnownCashEndpointV3;
const scope = {
  ...marketKnownCashRequestV3Schema.shape,
  protocolVersion: z.literal('known-cash-control-v1'),
  expectedControlIdentity: marketKnownCashControlIdentityV3Schema,
};
function validateControlScope(
  value: {
    start: string;
    end: string;
    desiredRevision: number;
    effectivePolicyRevision: number;
    dataAsOf: string;
  },
  ctx: z.RefinementCtx,
) {
  validateMarketKnownCashScopeV3(value, ctx);
  try {
    parseMarketPitEvidenceInstantV1(value.dataAsOf);
  } catch {
    ctx.addIssue({ code: 'custom', path: ['dataAsOf'], message: '固定研究请求时钟无效' });
  }
}
export const marketKnownCashControlRequestV3Schema = z
  .strictObject(scope)
  .superRefine(validateControlScope);

/** 当前控制复核；checkedAt不替代历史研究时钟，不提供源资料或准入。 */
export const marketKnownCashControlResponseV3Schema = z
  .strictObject({
    ...scope,
    status: z.literal('verified'),
    readOnly: z.literal(true),
    upstreamRead: z.literal(false),
    checkedAt: z.iso.datetime({ offset: true }),
    controlIdentity: marketKnownCashControlIdentityV3Schema,
    targetSequence: z.array(marketDataRouteTargetPinV3Schema).min(1).max(2),
  })
  .superRefine((value, ctx) => {
    validateControlScope(value, ctx);
    if (JSON.stringify(value.expectedControlIdentity) !== JSON.stringify(value.controlIdentity))
      ctx.addIssue({
        code: 'custom',
        path: ['controlIdentity'],
        message: '现金来源控制身份已变化，需重新准备',
      });
    const identities = new Set<string>();
    value.targetSequence.forEach((target, index) => {
      const identity = JSON.stringify([target.providerId, target.upstreamSource]);
      if (target.routeIndex !== index || identities.has(identity))
        ctx.addIssue({
          code: 'custom',
          path: ['targetSequence', index],
          message: '保存目标顺序无效或重复',
        });
      identities.add(identity);
    });
    if (
      JSON.stringify(value.targetSequence[value.routeTarget.routeIndex]) !==
      JSON.stringify(value.routeTarget)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['targetSequence'],
        message: '复核选中位置与固定目标不符',
      });
    try {
      parseMarketPitEvidenceInstantV1(value.checkedAt);
    } catch {
      ctx.addIssue({ code: 'custom', path: ['checkedAt'], message: '控制复核时钟无效' });
    }
  });
export const marketKnownCashControlExchangeV3Schema = z
  .strictObject({
    request: marketKnownCashControlRequestV3Schema,
    response: marketKnownCashControlResponseV3Schema,
  })
  .superRefine(({ request, response }, ctx) => {
    for (const key of Object.keys(scope) as (keyof typeof scope)[]) {
      if (JSON.stringify(request[key]) !== JSON.stringify(response[key]))
        ctx.addIssue({
          code: 'custom',
          path: ['response', key],
          message: '现金控制复核响应与请求不一致',
        });
    }
  });
export const marketKnownCashControlErrorV3Schema = marketKnownCashErrorV3Schema.extend({
  protocolVersion: z.literal('known-cash-control-v1'),
});
export type MarketKnownCashControlRequestV3 = z.infer<typeof marketKnownCashControlRequestV3Schema>;
export type MarketKnownCashControlResponseV3 = z.infer<
  typeof marketKnownCashControlResponseV3Schema
>;
