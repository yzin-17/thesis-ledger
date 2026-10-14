import { z } from 'zod';
import { marketRouteTargetSchema } from './market-route-target.js';
import { positiveDecimalStringSchema } from './monetary-values.js';

const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const nonempty = z.string().trim().min(1);

const factSource = z.strictObject({
  provider: nonempty,
  revision: nonempty,
  availableAt: isoDateTime,
});

const knownListingInformationV3Schema = z.strictObject({ listedOn: isoDate, source: factSource });

/** 日级证据的上市信息，标的身份由父记录绑定。 */
export const backtestListingInformationV3Schema = z.union([
  knownListingInformationV3Schema,
  z.strictObject({ status: z.literal('unknown') }),
]);
export type BacktestListingInformationV3 = z.infer<typeof backtestListingInformationV3Schema>;

export const backtestUnknownListingWarningV3 = '未获取上市日期，未验证回测窗口与上市日期的边界关系';

/** 对来源响应的当前采集，不表示任一历史决策时刻可见。 */
const barSource = z.strictObject({
  routeKey: z.strictObject({
    kind: z.literal('bar'),
    market: z.enum(['CN', 'HK', 'US']),
    assetType: z.enum(['STOCK', 'ETF']),
    capability: z.literal('DAILY_BAR'),
    timeframe: z.literal('1d'),
    adjustment: z.enum(['none', 'qfq', 'hfq']),
  }),
  routeTarget: marketRouteTargetSchema.strict(),
  providerRevision: nonempty,
  responseSha256: sha256,
  observedAt: isoDateTime,
  requestComplete: z.literal(true),
  paginationComplete: z.literal(true),
});

const day = z
  .strictObject({
    date: isoDate,
    state: z.enum(['observed-traded', 'assumed-untradable-no-bar']),
    excludedZeroVolumeObservation: z
      .strictObject({
        open: positiveDecimalStringSchema,
        high: positiveDecimalStringSchema,
        low: positiveDecimalStringSchema,
        close: positiveDecimalStringSchema,
        volume: z.literal('0'),
        sourceResponseSha256: sha256,
      })
      .optional(),
  })
  .refine(
    (value) => !value.excludedZeroVolumeObservation || value.state === 'assumed-untradable-no-bar',
    { message: '零量来源观察不得作为已成交可执行Bar' },
  );

/**
 * 场内证券在一个精确来源窗口内的日级可交易性证据。
 * Schema 只校验结构和日期分区；生产者及消费者仍须核对真实日历、上市事实、
 * Bar 内容、来源准入、冻结时点和历史决策可见性。
 */
export const backtestDailyTradabilityEvidenceV3Schema = z
  .strictObject({
    contractVersion: z.literal(1),
    symbol: nonempty,
    market: z.enum(['CN', 'HK', 'US']),
    instrumentType: z.enum(['STOCK', 'ETF']),
    range: z.strictObject({ start: isoDate, end: isoDate }),
    listing: backtestListingInformationV3Schema,
    calendar: z.strictObject({ source: factSource, expectedSessions: z.array(isoDate).min(1) }),
    barSource,
    days: z.array(day).min(1),
  })
  .superRefine((value, context) => {
    const { start, end } = value.range;
    const normalizedYahoo = value.market !== 'CN' && value.barSource.routeKey.adjustment === 'qfq' &&
      value.barSource.routeTarget.upstreamSource === 'yfinance';
    const hkShareWindow = value.market === 'HK' && value.symbol === '00147.HK' &&
      start >= '2025-08-06' && end <= '2025-08-11' && value.barSource.routeKey.adjustment === 'none' &&
      value.barSource.routeTarget.upstreamSource === 'yahoo-hk-share-window';
    if (value.days.some((day) => day.excludedZeroVolumeObservation) &&
      (value.instrumentType !== 'STOCK' || value.barSource.routeTarget.providerId !== 'yfinance' ||
        !(normalizedYahoo || hkShareWindow)))
      context.addIssue({ code: 'custom', path: ['days'], message: '零量排除仅适用于已限定Yahoo研究来源与窗口' });
    if (value.market !== value.barSource.routeKey.market)
      context.addIssue({
        code: 'custom',
        path: ['barSource', 'routeKey', 'market'],
        message: '日级证据市场与Bar来源不一致',
      });
    if (start > end || ('listedOn' in value.listing && start < value.listing.listedOn)) {
      context.addIssue({
        code: 'custom',
        path: ['range'],
        message: '范围必须有序，且不早于已知上市日',
      });
    }
    if (value.barSource.routeKey.assetType !== value.instrumentType) {
      context.addIssue({
        code: 'custom',
        path: ['barSource', 'routeKey', 'assetType'],
        message: 'Bar 路由资产类型与标的类型不一致',
      });
    }
    const expected = value.calendar.expectedSessions;
    for (let index = 0; index < expected.length; index += 1) {
      const date = expected[index]!;
      if (date < start || date > end || (index > 0 && date <= expected[index - 1]!)) {
        context.addIssue({
          code: 'custom',
          path: ['calendar', 'expectedSessions', index],
          message: '预期交易日须在范围内严格递增',
        });
      }
      if (value.days[index]?.date !== date) {
        context.addIssue({
          code: 'custom',
          path: ['days', index],
          message: '每个预期交易日须有且仅有一个状态',
        });
      }
    }
    if (value.days.length !== expected.length) {
      context.addIssue({
        code: 'custom',
        path: ['days'],
        message: '日级状态数量必须等于预期交易日数量',
      });
    }
  });
export type BacktestDailyTradabilityEvidenceV3 = z.infer<
  typeof backtestDailyTradabilityEvidenceV3Schema
>;
