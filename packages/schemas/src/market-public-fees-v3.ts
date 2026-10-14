import { z } from 'zod';
import { marketRouteKeyV3Schema } from './market-route-v3.js';
import { marketDataRouteTargetPinV3Schema } from './market-data-wire-v3.js';
import { nonNegativeDecimalStringSchema, positiveDecimalStringSchema } from './monetary-values.js';
import { publicFeeRoundingV3Schema } from './backtest-execution-fees.js';

const text = z.string().trim().min(1);
const date = z.iso.date();
export const marketPublicFeesCapabilityV3 = 'HISTORICAL_PUBLIC_FEES' as const;
export const marketPublicFeesEndpointV3 = '/api/v3/thesis-ledger/market/public-fees' as const;
const key = marketRouteKeyV3Schema.pipe(
  z.strictObject({
    kind: z.literal('data'),
    market: z.enum(['CN', 'HK', 'US']),
    assetType: z.literal('STOCK'),
    capability: z.literal(marketPublicFeesCapabilityV3),
  }),
);
const range = z
  .strictObject({ start: date, end: date })
  .refine((value) => value.start <= value.end, { message: '公共收费请求起点不得晚于终点' });
const envelope = {
  contractVersion: z.literal(3),
  consumer: z.literal('thesis-ledger'),
  requestId: text,
  routeKey: key,
  routeTarget: marketDataRouteTargetPinV3Schema,
  symbol: text,
  range,
};

export const marketPublicFeesRequestV3Schema = z.strictObject(envelope);
export type MarketPublicFeesRequestV3 = z.infer<typeof marketPublicFeesRequestV3Schema>;

export const marketPublicFeeChargeV3Schema = z.strictObject({
  code: z.enum(['stampDuty', 'handlingFee', 'regulatoryFee', 'transferFee', 'afrcLevy', 'tradingActivityFee']),
  side: z.enum(['buy', 'sell', 'both']),
  basis: z.enum(['turnover', 'actualShares']),
  rate: nonNegativeDecimalStringSchema,
  currency: z.enum(['CNY', 'HKD', 'USD']),
  sourceDocumentIds: z.array(text).min(1),
  amountRounding: publicFeeRoundingV3Schema.optional(),
  maximumAmount: positiveDecimalStringSchema.optional(),
  lowPriceExemption: z.literal('belowPerShareRate').optional(),
}).superRefine((charge, context) => {
  if (charge.code === 'tradingActivityFee') {
    if (charge.basis !== 'actualShares' || charge.currency !== 'USD' || charge.side !== 'sell' || !charge.maximumAmount || !charge.lowPriceExemption)
      context.addIssue({ code: 'custom', path: ['basis'], message: 'TAF需要实际股数、美元卖侧、上限和低价豁免' });
  } else if (charge.basis !== 'turnover' || charge.maximumAmount || charge.lowPriceExemption)
    context.addIssue({ code: 'custom', path: ['basis'], message: '其他公共费项仅支持成交额基数' });
  if (charge.amountRounding && (charge.code !== 'stampDuty' || charge.currency !== 'HKD' || charge.amountRounding.mode !== 'ceil'))
    context.addIssue({ code: 'custom', path: ['amountRounding'], message: '来源金额进位仅支持港股印花税整港元进位' });
  if (charge.code === 'afrcLevy' && (charge.currency !== 'HKD' || charge.side !== 'both'))
    context.addIssue({ code: 'custom', path: ['side'], message: 'AFRC为港元双侧公共费项' });
});
export const marketPublicFeeSegmentV3Schema = z.strictObject({
  range: z
    .strictObject({ start: date, endExclusive: date })
    .refine((value) => value.start < value.endExclusive, {
      message: '收费分段必须是非空左闭右开区间',
    }),
  charges: z.array(marketPublicFeeChargeV3Schema).min(1),
});

export const marketPublicFeesResponseV3Schema = z.strictObject({
  ...envelope,
  status: z.literal('supported'),
  segments: z.array(marketPublicFeeSegmentV3Schema).min(1),
  sourceDocuments: z
    .array(
      z.strictObject({
        id: text,
        title: text,
        url: z.url(),
        publishedDate: date.nullable(),
        kind: z.enum(['officialPublication', 'governmentNewsRepublication']),
        sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        observedAt: z.iso.datetime({ offset: true }).optional(),
      }),
    )
    .min(1),
  provenance: z.strictObject({
    providerId: text,
    upstreamSource: text,
    providerRevision: text,
    datasetId: text,
    fetchedAt: z.iso.datetime({ offset: true }),
    exchange: text,
    tradingMethod: z.enum(['auction', 'exchangeTrading']),
    calculationSettings: z.literal('executionModel'),
    historicalAvailability: z.literal('notVerified'),
    coverageDescription: text.optional(),
    chargeDatePolicy: z
      .strictObject({
        basis: z.literal('exchangeSettlement'),
        settlementLagSessions: z.literal(2),
        rateChangeChargeDate: date,
        effectiveTradeDate: date,
        calendarRevision: text,
      })
      .optional(),
  }),
});
export type MarketPublicFeesResponseV3 = z.infer<typeof marketPublicFeesResponseV3Schema>;
