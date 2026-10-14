import { z } from 'zod';
import { marketCashAssessmentV3Schema } from './market-cash-assessment-v3.js';
import { executionPriceProtocolSchema } from './market-price-protocol.js';
import { marketDataRouteTargetPinV3Schema } from './market-data-wire-v3.js';
import { compareMarketPitEvidenceInstantStringsV1 } from './market-pit-evidence-instant-v1.js';
import { backtestKnownCashResearchPolicyV3Schema } from './backtest-known-cash-research-policy-v3.js';
import {
  marketKnownCashRecordV3Schema,
  marketKnownCashQueryIdentityV3Schema,
  marketKnownCashControlIdentityV3Schema,
  validateMarketKnownCashRecordsV3,
} from './market-known-cash-record-v3.js';

const text = z.string().trim().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime({ offset: true });

export const backtestKnownCashResearchRecordV3Schema = marketKnownCashRecordV3Schema;

/** 尚未接入旧运行入口；不能作为完整公司行动响应使用。 */
export const backtestKnownCashResearchInputV3Schema = z
  .strictObject({
    policy: backtestKnownCashResearchPolicyV3Schema,
    scope: z.strictObject({
      symbol: text,
      market: z.literal('CN'),
      instrumentType: z.literal('ETF'),
      currency: z.literal('CNY'),
      startDate: z.iso.date(),
      endDate: z.iso.date(),
      dataAsOf: timestamp,
    }),
    executionPriceProtocol: executionPriceProtocolSchema,
    source: z.strictObject({
      target: marketDataRouteTargetPinV3Schema,
      providerRevision: text,
      adapterRevision: text,
      normalizationRevision: text,
      responseSha256: hash,
      observedAt: timestamp,
      queryIdentity: marketKnownCashQueryIdentityV3Schema.optional(),
      controlIdentity: marketKnownCashControlIdentityV3Schema.optional(),
    }),
    revisions: z.strictObject({
      desiredRevision: z.number().int().positive(),
      effectivePolicyRevision: z.number().int().positive(),
      catalogRevision: z.number().int().positive(),
    }),
    coverage: z.strictObject({ complete: z.literal(false), reason: text }),
    ignoredEmptyRows: z.number().int().nonnegative(),
    records: z.array(backtestKnownCashResearchRecordV3Schema).max(100_000),
    assessment: marketCashAssessmentV3Schema.optional(),
    recordsHash: hash,
    contentHash: hash,
  })
  .superRefine((value, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const { scope, source, executionPriceProtocol: protocol } = value;
    if (value.policy.uncertainRecords !== undefined && !value.assessment)
      issue(['assessment'], '新分红冻结输入缺少质量与原响应');
    if (scope.startDate > scope.endDate) issue(['scope'], '请求区间倒置');
    if (
      protocol.cashEventResearch !== 'ex-date-entitlement-payment-date-cash-v1' ||
      protocol.history.basis !== 'fixed-provider-snapshot' ||
      protocol.accountingBasis !== 'raw-events' ||
      protocol.priceBasis.adjustment !== 'none' ||
      protocol.priceBasis.quantityBasis !== 'actual-units' ||
      protocol.marketRuleResearch
    )
      issue(['executionPriceProtocol'], '已知方案研究需要显式原价现金时点模型');
    if (value.revisions.desiredRevision !== value.revisions.effectivePolicyRevision)
      issue(['revisions'], '控制策略版本尚未一致');
    for (const [key, observedAt] of [
      ['source', source.observedAt],
      ['executionPriceProtocol', protocol.priceBasis.observedAt],
    ] as const) {
      const order = compareMarketPitEvidenceInstantStringsV1(observedAt, scope.dataAsOf);
      if (order === undefined || order > 0) issue([key], '来源观察时钟晚于研究截止或无效');
    }
    if (source.queryIdentity && source.queryIdentity.requestedSymbol !== scope.symbol)
      issue(['source', 'queryIdentity'], '冻结查询身份与证券不一致');
    validateMarketKnownCashRecordsV3(value.records, scope, source.observedAt, ctx);
  });

export type BacktestKnownCashResearchInputV3 = z.infer<
  typeof backtestKnownCashResearchInputV3Schema
>;
export type BacktestKnownCashResearchRecordV3 = z.infer<
  typeof backtestKnownCashResearchRecordV3Schema
>;
