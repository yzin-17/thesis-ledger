import { z } from 'zod';
import { marketCashAssessmentV3Schema } from './market-cash-assessment-v3.js';
import { marketDataRouteTargetPinV3Schema } from './market-data-wire-v3.js';
import { marketEventErrorV3Schema } from './market-event-wire-v3.js';
import { backtestKnownCashResearchPolicyV3Schema } from './backtest-known-cash-research-policy-v3.js';
import { compareMarketPitEvidenceInstantStringsV1 } from './market-pit-evidence-instant-v1.js';
import {
  marketKnownCashQueryIdentityV3Schema,
  marketKnownCashControlIdentityV3Schema,
  marketKnownCashRecordV3Schema,
  validateMarketKnownCashRecordsV3,
} from './market-known-cash-record-v3.js';

const text = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });
const revision = z.number().int().positive();
const scope = {
  contractVersion: z.literal(3),
  protocolVersion: z.literal('known-cash-observations-v1'),
  requestId: text,
  symbol: z.string().regex(/^\d{6}\.(SH|SZ)$/),
  routeKey: z.strictObject({
    kind: z.literal('data'),
    market: z.literal('CN'),
    assetType: z.literal('ETF'),
    capability: z.literal('CASH_DISTRIBUTION'),
  }),
  routeTarget: marketDataRouteTargetPinV3Schema,
  desiredRevision: revision,
  effectivePolicyRevision: revision,
  catalogRevision: revision,
  start: z.iso.date(),
  end: z.iso.date(),
  dataAsOf: timestamp,
  currency: z.literal('CNY'),
  researchPolicy: backtestKnownCashResearchPolicyV3Schema,
};

export function validateMarketKnownCashScopeV3(
  value: { start: string; end: string; desiredRevision: number; effectivePolicyRevision: number },
  ctx: z.RefinementCtx,
) {
  if (value.start > value.end)
    ctx.addIssue({ code: 'custom', path: ['start'], message: '方案请求区间倒置' });
  if (value.desiredRevision !== value.effectivePolicyRevision)
    ctx.addIssue({
      code: 'custom',
      path: ['effectivePolicyRevision'],
      message: '方案请求控制版本未一致',
    });
}
export const marketKnownCashEndpointV3 = '/api/v3/thesis-ledger/market/events';
export const marketKnownCashFailureReasonV3Schema = z.enum([
  'credential_missing',
  'provider_unavailable',
  'dependency_missing',
  'route_not_configured',
  'policy_version_mismatch',
  'policy_unavailable',
  'catalog_version_mismatch',
  'configuration_changed',
  'research_protocol_not_supported',
  'invalid_research_request',
  'invalid_research_scope',
  'invalid_source_response',
  'invalid_control_or_source_response',
  'source_unavailable',
  'permission_denied',
  'authentication_failed',
  'rate_limited',
  'transport_error',
  'upstream_failure',
  'symbol_not_found',
  'data_not_ready',
  'range_exceeded',
  'response_too_large',
  'count_mismatch',
  'invalid_clock',
  'invalid_response',
  'invalid_request',
  'http_error',
  'provider_error',
  'unsupported_capability',
  'missing_credentials',
]);
export const marketKnownCashErrorV3Schema = z.strictObject({
  contractVersion: z.literal(3),
  protocolVersion: z.literal('known-cash-observations-v1'),
  requestId: text,
  error: z.strictObject({
    code: marketEventErrorV3Schema.shape.error.shape.code,
    reason: marketKnownCashFailureReasonV3Schema,
    message: text,
  }),
});
export type MarketKnownCashFailureReasonV3 = z.infer<typeof marketKnownCashFailureReasonV3Schema>;
export const marketKnownCashRequestV3Schema = z
  .strictObject(scope)
  .superRefine(validateMarketKnownCashScopeV3);
export const marketKnownCashResponseV3Schema = z
  .strictObject({
    ...scope,
    fetchedAt: timestamp,
    source: z.strictObject({
      target: marketDataRouteTargetPinV3Schema,
      providerRevision: text,
      adapterRevision: text,
      normalizationRevision: text,
      responseSha256: z.string().regex(/^[a-f0-9]{64}$/),
      observedAt: timestamp,
      queryIdentity: marketKnownCashQueryIdentityV3Schema,
      controlIdentity: marketKnownCashControlIdentityV3Schema,
    }),
    coverage: z.strictObject({ complete: z.literal(false), reason: text }),
    ignoredEmptyRows: z.number().int().nonnegative(),
    records: z.array(marketKnownCashRecordV3Schema).max(5_000),
    assessment: marketCashAssessmentV3Schema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.researchPolicy.uncertainRecords !== undefined && !value.assessment)
      ctx.addIssue({ code: 'custom', path: ['assessment'], message: '新分红研究缺少质量与原响应' });
    validateMarketKnownCashScopeV3(value, ctx);
    if (
      JSON.stringify(value.source.target) !== JSON.stringify(value.routeTarget) ||
      value.source.queryIdentity.requestedSymbol !== value.symbol
    )
      ctx.addIssue({ code: 'custom', path: ['source'], message: '方案来源或查询身份与请求不一致' });
    for (const upper of [value.dataAsOf, value.fetchedAt]) {
      const order = compareMarketPitEvidenceInstantStringsV1(value.source.observedAt, upper);
      if (order === undefined || order > 0)
        ctx.addIssue({
          code: 'custom',
          path: ['source', 'observedAt'],
          message: '方案观察晚于读取/研究截止或无效',
        });
    }
    validateMarketKnownCashRecordsV3(
      value.records,
      { symbol: value.symbol, startDate: value.start, endDate: value.end },
      value.source.observedAt,
      ctx,
    );
  });
export const marketKnownCashExchangeV3Schema = z
  .strictObject({
    request: marketKnownCashRequestV3Schema,
    response: marketKnownCashResponseV3Schema,
  })
  .superRefine(({ request, response }, ctx) => {
    for (const key of Object.keys(scope) as (keyof typeof scope)[]) {
      if (JSON.stringify(request[key]) !== JSON.stringify(response[key]))
        ctx.addIssue({
          code: 'custom',
          path: ['response', key],
          message: '方案响应与固定请求不一致',
        });
    }
  });
export type MarketKnownCashRequestV3 = z.infer<typeof marketKnownCashRequestV3Schema>;
export type MarketKnownCashResponseV3 = z.infer<typeof marketKnownCashResponseV3Schema>;
