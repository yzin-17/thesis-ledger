import { z } from 'zod';
import { marketBasicLifecycleV3Schema, basicLifecycleIssues } from './market-basic-lifecycle-v3.js';
import { marketRouteKeyV3Schema } from './market-route-v3.js';
import { marketDataRouteTargetPinV3Schema } from './market-data-wire-v3.js';
import { positiveDecimalStringSchema } from './monetary-values.js';
import {
  structuredStatusRecordSchema,
  structuredStatusCoverageSchema,
  structuredStatusIssues,
} from './market-structured-status-v3.js';

const text = z.string().trim().min(1);
const date = z.iso.date();
export const marketTradingStatusCapabilityV3 = 'HISTORICAL_TRADING_STATUS' as const;
export const marketTradingStatusEndpointV3 = '/api/v3/thesis-ledger/market/trading-status' as const;
const key = marketRouteKeyV3Schema.refine(
  (value) =>
    value.kind === 'data' &&
    value.capability === marketTradingStatusCapabilityV3 &&
    ['CN', 'HK', 'US'].includes(value.market) &&
    value.assetType === 'STOCK',
  { message: '历史状态合同只支持已接入市场的股票状态' },
);
const range = z
  .strictObject({ start: date, end: date })
  .refine((value) => value.start <= value.end, { message: '交易状态请求起点不得晚于终点' });
const envelope = {
  contractVersion: z.literal(3),
  consumer: z.literal('thesis-ledger'),
  requestId: text,
  routeKey: key,
  routeTarget: marketDataRouteTargetPinV3Schema,
  symbol: text,
  range,
};
export const marketTradingStatusRequestV3Schema = z.strictObject(envelope);
export type MarketTradingStatusRequestV3 = z.infer<typeof marketTradingStatusRequestV3Schema>;

const ratio = positiveDecimalStringSchema.refine((value) => Number(value) < 1, {
  message: '日涨跌幅比例必须在0与1之间',
});
const day = z
  .strictObject({
    date,
    state: z.enum(['unknown', 'suspended', 'trading']),
    sourceDocumentIds: z.array(text).min(1).optional(),
    sourceRecordIds: z.array(text).min(1).optional(),
    coarseST: z.enum(['flagged', 'notFlagged']).optional(),
    listingPhase: z
      .enum(['notListed', 'initialListing', 'listed', 'delistingPeriod', 'delisted'])
      .optional(),
    noDailyPriceLimit: z.strictObject({ reason: text }).optional(),
    riskWarning: z
      .strictObject({
        delisting: z.enum(['active', 'none', 'unknown']),
        other: z.enum(['active', 'none', 'unknown']),
      })
      .refine((value) => value.delisting !== 'unknown' || value.other !== 'unknown', {
        message: '完全未知的风险警示不能声明为来源事实',
      })
      .optional(),
    dailyPriceLimit: z
      .strictObject({
        reference: z.literal('previousRawClose'),
        maxUpRatio: ratio,
        maxDownRatio: ratio,
      })
      .optional(),
  })
  .extend({
    intradayHalts: z
      .array(
        z
          .strictObject({
            startedAt: z.iso.datetime({ offset: true }),
            endedAt: z.iso.datetime({ offset: true }).nullable(),
            reason: text,
          })
          .superRefine((value, context) => {
            if (value.endedAt && Date.parse(value.endedAt) <= Date.parse(value.startedAt))
              context.addIssue({
                code: 'custom',
                path: ['endedAt'],
                message: '恢复时刻必须晚于暂停时刻',
              });
          }),
      )
      .min(1)
      .optional(),
  })
  .superRefine((value, context) => {
    const known =
      value.state !== 'unknown' ||
      value.riskWarning ||
      value.dailyPriceLimit ||
      value.noDailyPriceLimit ||
      value.listingPhase ||
      value.coarseST ||
      value.intradayHalts;
    if (value.dailyPriceLimit && value.noDailyPriceLimit)
      context.addIssue({
        code: 'custom',
        path: ['noDailyPriceLimit'],
        message: '日价格限制与无日限制不能同时声明',
      });
    if (
      value.state === 'trading' &&
      (value.listingPhase === 'notListed' || value.listingPhase === 'delisted')
    )
      context.addIssue({
        code: 'custom',
        path: ['state'],
        message: '未上市或已摘牌不能声明交易所可交易',
      });
    if (value.intradayHalts?.some((halt) => halt.startedAt.slice(0, 10) !== value.date))
      context.addIssue({
        code: 'custom',
        path: ['intradayHalts'],
        message: '盘中暂停必须绑定实际开始的当地日期',
      });
    if (known && !value.sourceDocumentIds && !value.sourceRecordIds)
      context.addIssue({
        code: 'custom',
        path: ['sourceDocumentIds'],
        message: '已知状态或规则必须引用实际来源',
      });
    if (!known && (value.sourceDocumentIds || value.sourceRecordIds))
      context.addIssue({
        code: 'custom',
        path: ['sourceDocumentIds'],
        message: '完全未知日期不能补造事实来源引用',
      });
  });
export const marketTradingStatusResponseV3Schema = z
  .strictObject({
    ...envelope,
    status: z.literal('supported'),
    days: z.array(day).min(1),
    sourceRecords: z.array(structuredStatusRecordSchema).min(1).optional(),
    structuredCoverage: structuredStatusCoverageSchema.optional(),
    basicLifecycle: marketBasicLifecycleV3Schema.optional(),
    sourceDocuments: z.array(
      z
        .strictObject({
          id: text,
          title: text,
          url: z.url(),
          publishedDate: date.nullable(),
          kind: z.enum(['issuerDisclosure', 'exchangePublication']),
          sha256: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
          observedAt: z.iso.datetime({ offset: true }).optional(),
        })
        .superRefine((value, context) => {
          if (Boolean(value.sha256) !== Boolean(value.observedAt))
            context.addIssue({
              code: 'custom',
              path: ['observedAt'],
              message: '原件摘要与实际观察时钟必须成对保留',
            });
        }),
    ),
    provenance: z.strictObject({
      providerId: text,
      upstreamSource: text,
      providerRevision: text,
      datasetId: text,
      fetchedAt: z.iso.datetime({ offset: true }),
      granularity: z.enum(['1d', 'intraday']),
      timezone: z.enum(['Asia/Shanghai', 'Asia/Hong_Kong', 'America/New_York']).optional(),
      historicalAvailability: z.literal('notVerified'),
    }),
  })
  .superRefine((value, context) => {
    for (const message of [...structuredStatusIssues(value), ...basicLifecycleIssues(value)])
      context.addIssue({ code: 'custom', path: ['sourceRecords'], message });
    const cursor = new Date(`${value.range.start}T00:00:00Z`);
    const intraday = value.days.some((item) => item.intradayHalts);
    const timezone = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' }[
      value.routeKey.market
    ];
    if (
      intraday &&
      (value.provenance.granularity !== 'intraday' || value.provenance.timezone !== timezone)
    )
      context.addIssue({
        code: 'custom',
        path: ['provenance'],
        message: '盘中状态必须保留匹配市场的时区和真实粒度',
      });
    if (!Number.isFinite(cursor.getTime())) return;
    const documentIds = new Set(value.sourceDocuments.map((item) => item.id));
    for (const [index, item] of value.days.entries()) {
      if (item.date !== cursor.toISOString().slice(0, 10) || item.date > value.range.end)
        context.addIssue({
          code: 'custom',
          path: ['days', index],
          message: '交易状态须逐日覆盖请求区间，未知保留 unknown',
        });
      if (item.sourceDocumentIds?.some((id) => !documentIds.has(id)))
        context.addIssue({
          code: 'custom',
          path: ['days', index],
          message: '已知交易状态必须引用实际来源文档',
        });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (value.days.at(-1)?.date !== value.range.end)
      context.addIssue({ code: 'custom', path: ['days'], message: '交易状态未覆盖请求终点' });
  });
export type MarketTradingStatusResponseV3 = z.infer<typeof marketTradingStatusResponseV3Schema>;
