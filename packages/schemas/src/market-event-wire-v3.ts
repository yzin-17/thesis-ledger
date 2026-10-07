import { z } from 'zod';
import { corporateActionFactSchema } from './backtest-data.js';
import { marketDataRouteTargetPinV3Schema } from './market-data-wire-v3.js';
import { marketEventAdmissionV3Schema } from './market-event-admission-v3.js';
import { marketRouteKeyIdV3 } from './market-route-v3.js';
import {
  marketRqdataIdentityEvidenceV3Schema,
  validateMarketRqdataIdentityResponseV3,
} from './market-rqdata-identity-v3.js';
import {
  isMarketTushareCashIdentityRouteV3,
  marketTushareEventAdmissionV3Schema,
  marketTushareIdentityEvidenceV3Schema,
  validateMarketTushareIdentityResponseV3,
} from './market-tushare-identity-v3.js';
import {
  isMarketHithinkCashIdentityRouteV3,
  marketHithinkEventAdmissionV3Schema,
  marketHithinkIdentityEvidenceV3Schema,
  validateMarketHithinkIdentityResponseV3,
} from './market-hithink-identity-v3.js';

const text = z.string().trim().min(1);
const revision = z.number().int().positive();
export const marketEventErrorV3Schema = z.strictObject({
  contractVersion: z.literal(3),
  requestId: text,
  error: z.strictObject({
    code: z.enum([
      'invalid_request',
      'not_adapted',
      'not_admitted',
      'policy_not_applied',
      'invalid_response',
      'upstream_failure',
    ]),
    message: text,
  }),
});
const route = z.strictObject({
  kind: z.literal('data'),
  market: z.enum(['CN', 'HK', 'US']),
  assetType: z.enum(['STOCK', 'ETF']),
  capability: z.enum(['CASH_DISTRIBUTION', 'SPLIT_EVENT']),
});

const scope = {
  contractVersion: z.literal(3),
  requestId: text,
  symbol: text,
  routeKey: route,
  routeTarget: marketDataRouteTargetPinV3Schema,
  desiredRevision: revision,
  effectivePolicyRevision: revision,
  catalogRevision: revision,
  start: z.iso.date(),
  end: z.iso.date(),
  dataAsOf: z.iso.datetime({ offset: true }),
};

export const marketEventRequestV3Schema = z.strictObject(scope).superRefine((value, ctx) => {
  if (value.start > value.end) {
    ctx.addIssue({ code: 'custom', path: ['end'], message: '事件窗口结束日不得早于开始日' });
  }
  if (value.desiredRevision !== value.effectivePolicyRevision) {
    ctx.addIssue({
      code: 'custom',
      path: ['effectivePolicyRevision'],
      message: '事件策略尚未同步',
    });
  }
});
export type MarketEventRequestV3 = z.infer<typeof marketEventRequestV3Schema>;

function eventAdmissionMatchesResponse(
  value: MarketEventRequestV3 & { fetchedAt: string },
  admission: z.infer<typeof marketEventAdmissionV3Schema>,
  preciseIdentity: boolean,
): boolean {
  if (
    marketRouteKeyIdV3(admission.routeKey) !== marketRouteKeyIdV3(value.routeKey) ||
    admission.target.providerId !== value.routeTarget.providerId ||
    admission.target.upstreamSource !== value.routeTarget.upstreamSource ||
    !admission.scopeSymbols.includes(value.symbol) ||
    admission.scopeDateFrom > value.start ||
    admission.scopeDateTo < value.end
  )
    return false;
  if (preciseIdentity) return true;
  const fetched = Date.parse(value.fetchedAt);
  return !(
    fetched < Date.parse(admission.validFrom) ||
    fetched >= Date.parse(admission.validUntil) ||
    fetched < Date.parse(admission.recordedAt)
  );
}

/** 完整覆盖引用必须由运行时核实其来源、窗口、修订与撤销状态。 */
export const marketEventResponseV3Schema = z
  .strictObject({
    ...scope,
    fetchedAt: z.iso.datetime({ offset: true }),
    providerRevision: text,
    admission: marketEventAdmissionV3Schema
      .refine(
        (value) =>
          !isMarketTushareCashIdentityRouteV3({
            routeKey: value.routeKey,
            routeTarget: value.target,
          }) &&
          !isMarketHithinkCashIdentityRouteV3({
            routeKey: value.routeKey,
            routeTarget: value.target,
          }),
      )
      .or(marketTushareEventAdmissionV3Schema)
      .or(marketHithinkEventAdmissionV3Schema)
      .optional(),
    identityEvidence: marketRqdataIdentityEvidenceV3Schema.optional(),
    tushareIdentityEvidence: marketTushareIdentityEvidenceV3Schema.optional(),
    hithinkIdentityEvidence: marketHithinkIdentityEvidenceV3Schema.optional(),
    dateMappingEvidence: z
      .strictObject({
        ref: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        content: z
          .string()
          .min(1)
          .max(1024 * 1024),
      })
      .optional(),
    coverage: z.discriminatedUnion('complete', [
      z.strictObject({ complete: z.literal(true), admissionEvidenceRef: text }),
      z.strictObject({ complete: z.literal(false), reason: text }),
    ]),
    facts: z.array(corporateActionFactSchema).max(100_000),
  })
  .superRefine((value, ctx) => {
    const preciseIdentity =
      isMarketTushareCashIdentityRouteV3(value) || isMarketHithinkCashIdentityRouteV3(value);
    try {
      validateMarketTushareIdentityResponseV3(value);
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: ['tushareIdentityEvidence'],
        message: 'Tushare 身份原文、范围、精确时间或币种校验失败',
      });
    }
    try {
      validateMarketRqdataIdentityResponseV3(value);
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: ['identityEvidence'],
        message: 'RQData 身份原文、范围或币种校验失败',
      });
    }
    try {
      validateMarketHithinkIdentityResponseV3(value);
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: ['hithinkIdentityEvidence'],
        message: 'HiThink 身份原文、范围、精确时间或币种校验失败',
      });
    }
    const admission = value.admission;
    const mapping = value.dateMappingEvidence;
    if (
      mapping &&
      (value.routeKey.capability !== 'SPLIT_EVENT' ||
        !admission ||
        mapping.ref !== admission.evidenceRef ||
        mapping.sha256 !== admission.evidenceSha256 ||
        mapping.ref !== `sha256:${mapping.sha256}`)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateMappingEvidence'],
        message: '日期映射与拆分准入不匹配',
      });
    }
    if (admission?.adapterRevision === 'dsa-eastmoney-fund-split-mapped-v1' && !mapping) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateMappingEvidence'],
        message: '映射拆分缺少证据原文',
      });
    }
    if (
      value.coverage.complete &&
      (!admission || value.coverage.admissionEvidenceRef !== admission.evidenceRef)
    ) {
      ctx.addIssue({ code: 'custom', path: ['admission'], message: '完整覆盖缺少匹配的准入快照' });
    }
    if (admission) {
      if (!eventAdmissionMatchesResponse(value, admission, preciseIdentity))
        ctx.addIssue({
          code: 'custom',
          path: ['admission'],
          message: '事件准入来源、范围或有效期不匹配',
        });
    }
    const parsed = marketEventRequestV3Schema.safeParse(
      Object.fromEntries(Object.keys(scope).map((key) => [key, value[key as keyof typeof scope]])),
    );
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
      }
    }
    const seen = new Set<string>();
    value.facts.forEach((fact, index) => {
      const fail = (message: string) =>
        ctx.addIssue({ code: 'custom', path: ['facts', index], message });
      if (
        fact.symbol !== value.symbol ||
        fact.market !== value.routeKey.market ||
        fact.instrumentType !== value.routeKey.assetType
      )
        fail('事件标的与路由不一致');
      if (
        fact.provider !== value.routeTarget.providerId ||
        fact.providerRevision !== value.providerRevision
      ) {
        fail('事件来源或修订与响应不一致');
      }
      const isCash = fact.type === 'CASH_DIVIDEND';
      if (isCash !== (value.routeKey.capability === 'CASH_DISTRIBUTION'))
        fail('事件类型与能力不一致');
      if (
        !fact.effectiveDate ||
        fact.effectiveDate < value.start ||
        fact.effectiveDate > value.end
      ) {
        fail('事件缺明确生效日或超出请求窗口');
      }
      if (
        !preciseIdentity &&
        (Date.parse(fact.availableAt) > Date.parse(value.dataAsOf) ||
          Date.parse(fact.availableAt) > Date.parse(value.fetchedAt))
      )
        fail('事件事实晚于观测或冻结截点');
      const identity = JSON.stringify([fact.symbol, fact.type, fact.effectiveDate]);
      if (seen.has(identity)) fail('事件标识重复或冲突');
      seen.add(identity);
    });
  });
export type MarketEventResponseV3 = z.infer<typeof marketEventResponseV3Schema>;

export const marketEventExchangeV3Schema = z
  .strictObject({
    request: marketEventRequestV3Schema,
    response: marketEventResponseV3Schema,
  })
  .superRefine(({ request, response }, ctx) => {
    const keys = [
      'contractVersion',
      'requestId',
      'symbol',
      'desiredRevision',
      'effectivePolicyRevision',
      'catalogRevision',
      'start',
      'end',
      'dataAsOf',
    ] as const;
    for (const key of keys) {
      if (request[key] !== response[key]) {
        ctx.addIssue({ code: 'custom', path: ['response', key], message: '事件响应未匹配请求' });
      }
    }
    for (const key of ['kind', 'market', 'assetType', 'capability'] as const) {
      if (request.routeKey[key] !== response.routeKey[key]) {
        ctx.addIssue({
          code: 'custom',
          path: ['response', 'routeKey', key],
          message: '事件能力不匹配',
        });
      }
    }
    for (const key of ['providerId', 'upstreamSource', 'routeIndex'] as const) {
      if (request.routeTarget[key] !== response.routeTarget[key]) {
        ctx.addIssue({
          code: 'custom',
          path: ['response', 'routeTarget', key],
          message: '事件来源不匹配',
        });
      }
    }
  });
