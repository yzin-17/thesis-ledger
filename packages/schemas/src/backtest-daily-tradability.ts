import { z } from 'zod';
import { marketRouteTargetSchema } from './market-route-target.js';

const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const nonempty = z.string().trim().min(1);

const factSource = z.strictObject({
  provider: nonempty,
  revision: nonempty,
  availableAt: isoDateTime,
});

/** 对来源响应的当前采集，不表示任一历史决策时刻可见。 */
const barSource = z.strictObject({
  routeKey: z.strictObject({
    kind: z.literal('bar'),
    market: z.literal('CN'),
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

const day = z.strictObject({
  date: isoDate,
  state: z.enum(['observed-traded', 'assumed-untradable-no-bar']),
});

/**
 * 已上市的场内证券在一个精确来源窗口内的日级可交易性证据。
 * Schema 只校验结构和日期分区；生产者及消费者仍须核对真实日历、上市事实、
 * Bar 内容、来源准入、冻结时点和历史决策可见性。
 */
export const backtestDailyTradabilityEvidenceV3Schema = z.strictObject({
  contractVersion: z.literal(1),
  symbol: nonempty,
  market: z.literal('CN'),
  instrumentType: z.enum(['STOCK', 'ETF']),
  range: z.strictObject({ start: isoDate, end: isoDate }),
  listing: z.strictObject({ listedOn: isoDate, source: factSource }),
  calendar: z.strictObject({ source: factSource, expectedSessions: z.array(isoDate).min(1) }),
  barSource,
  days: z.array(day).min(1),
}).superRefine((value, context) => {
  const { start, end } = value.range;
  if (start > end || start < value.listing.listedOn) {
    context.addIssue({ code: 'custom', path: ['range'], message: '范围必须为已上市且有序的日期窗口' });
  }
  if (value.barSource.routeKey.assetType !== value.instrumentType) {
    context.addIssue({ code: 'custom', path: ['barSource', 'routeKey', 'assetType'], message: 'Bar 路由资产类型与标的类型不一致' });
  }
  const expected = value.calendar.expectedSessions;
  for (let index = 0; index < expected.length; index += 1) {
    const date = expected[index]!;
    if (date < start || date > end || (index > 0 && date <= expected[index - 1]!)) {
      context.addIssue({ code: 'custom', path: ['calendar', 'expectedSessions', index], message: '预期交易日须在范围内严格递增' });
    }
    if (value.days[index]?.date !== date) {
      context.addIssue({ code: 'custom', path: ['days', index], message: '每个预期交易日须有且仅有一个状态' });
    }
  }
  if (value.days.length !== expected.length) {
    context.addIssue({ code: 'custom', path: ['days'], message: '日级状态数量必须等于预期交易日数量' });
  }
});
export type BacktestDailyTradabilityEvidenceV3 = z.infer<typeof backtestDailyTradabilityEvidenceV3Schema>;
