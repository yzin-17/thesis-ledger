import { z } from 'zod';
import {
  barPointSchema,
  barSeriesCoverageSchema,
  barSeriesIdentitySchema,
} from './market-bar-series.js';
import { priceAdjustmentSchema } from './market-price-protocol.js';

const text = z.string().trim().min(1);
const instant = z.iso.datetime({ offset: true });
const date = z.iso.date();
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const marketTimeframeSchema = z.enum(['1m', '1d', '5d', '1w', '1mo', '1y']);
export const marketDerivedTimeframeSchema = z.enum(['5d', '1w', '1mo', '1y']);
export const marketTimeframeKindSchema = z.enum(['base', 'derived']);
export const marketPeriodRuleVersionSchema = z.literal('market-period-aggregation-v1');
export type MarketTimeframe = z.infer<typeof marketTimeframeSchema>;

export const marketPeriodSessionSchema = z
  .strictObject({
    tradingDate: date,
    startAt: instant,
    endAt: instant,
  })
  .refine(
    (session) => Date.parse(session.startAt) < Date.parse(session.endAt),
    'Session 结束必须晚于开始',
  );

export const marketPeriodCalendarSchema = z
  .strictObject({
    market: z.enum(['CN', 'HK', 'US']),
    timezone: text,
    revision: text,
    availableAt: instant,
    coverageStart: date,
    coverageEnd: date,
    sessions: z.array(marketPeriodSessionSchema),
  })
  .superRefine((calendar, context) => {
    const timezones = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' };
    if (calendar.timezone !== timezones[calendar.market])
      context.addIssue({ code: 'custom', path: ['timezone'], message: '时区必须匹配市场' });
    if (calendar.coverageStart > calendar.coverageEnd)
      context.addIssue({
        code: 'custom',
        path: ['coverageEnd'],
        message: '日历覆盖终点不得早于起点',
      });
    calendar.sessions.forEach((session, index) => {
      if (
        session.tradingDate < calendar.coverageStart ||
        session.tradingDate > calendar.coverageEnd
      )
        context.addIssue({
          code: 'custom',
          path: ['sessions', index],
          message: 'Session 必须在完整日历区间内',
        });
    });
  });

export const marketPeriodDailyBarSchema = barPointSchema
  .extend({
    symbol: text,
    tradingDate: date,
    adjustment: priceAdjustmentSchema,
    priceBasisFingerprint: fingerprint,
  })
  .strict()
  .superRefine((bar, context) => {
    if (
      bar.high < Math.max(bar.open, bar.close, bar.low) ||
      bar.low > Math.min(bar.open, bar.close, bar.high)
    )
      context.addIssue({ code: 'custom', message: 'OHLC 价格范围不一致' });
  });

export const marketPeriodNoTradingEvidenceSchema = z.strictObject({
  symbol: text,
  tradingDate: date,
  calendarRevision: text,
  baseInputFingerprint: fingerprint,
  revision: text,
  availableAt: instant,
  evidenceRef: text,
  reason: z.enum(['suspended', 'no-trading']),
});

export const marketPeriodAggregationInputSchema = z
  .strictObject({
    symbol: text,
    timeframe: marketDerivedTimeframeSchema,
    adjustment: priceAdjustmentSchema,
    priceBasisFingerprint: fingerprint,
    baseInputFingerprint: fingerprint,
    evaluationAsOf: instant,
    ruleVersion: marketPeriodRuleVersionSchema,
    anchorTradingDate: date.optional(),
    calendar: marketPeriodCalendarSchema,
    bars: z.array(marketPeriodDailyBarSchema),
    noTradingEvidence: z.array(marketPeriodNoTradingEvidenceSchema),
  })
  .superRefine((input, context) => {
    if ((input.timeframe === '5d') !== (input.anchorTradingDate !== undefined))
      context.addIssue({
        code: 'custom',
        path: ['anchorTradingDate'],
        message: '仅 5d 周期必须指定交易日锚点',
      });
    const asOf = Date.parse(input.evaluationAsOf);
    if (Date.parse(input.calendar.availableAt) > asOf)
      context.addIssue({
        code: 'custom',
        path: ['calendar', 'availableAt'],
        message: '日历晚于评估时刻',
      });
    input.bars.forEach((bar, index) => {
      if (
        bar.symbol !== input.symbol ||
        bar.adjustment !== input.adjustment ||
        bar.priceBasisFingerprint !== input.priceBasisFingerprint
      )
        context.addIssue({
          code: 'custom',
          path: ['bars', index],
          message: '日线证券、复权与完整价格口径必须一致',
        });
      if (Date.parse(bar.availableAt) > asOf || Date.parse(bar.timestamp) > asOf)
        context.addIssue({ code: 'custom', path: ['bars', index], message: '日线晚于评估时刻' });
    });
    input.noTradingEvidence.forEach((evidence, index) => {
      if (
        evidence.symbol !== input.symbol ||
        evidence.calendarRevision !== input.calendar.revision ||
        evidence.baseInputFingerprint !== input.baseInputFingerprint ||
        Date.parse(evidence.availableAt) > asOf
      )
        context.addIssue({
          code: 'custom',
          path: ['noTradingEvidence', index],
          message: '覆盖证据必须绑定同次证券、日历、基础输入及评估时刻',
        });
    });
  });
export type MarketPeriodInputPayload = z.infer<typeof marketPeriodAggregationInputSchema>;

export const marketPeriodBarSchema = barPointSchema
  .extend({
    tradingDate: date,
    bucketStartDate: date,
    bucketEndDate: date,
    bucketEndAt: instant,
    expectedTradingDates: z.array(date).min(1),
    observedTradingDates: z.array(date).min(1),
    explainedTradingDates: z.array(date),
    missingTradingDates: z.array(date),
  })
  .strict()
  .superRefine((bar, context) => {
    const groups = [
      ...bar.observedTradingDates,
      ...bar.explainedTradingDates,
      ...bar.missingTradingDates,
    ];
    if (
      new Set(groups).size !== groups.length ||
      groups.length !== bar.expectedTradingDates.length ||
      groups.some((day) => !bar.expectedTradingDates.includes(day))
    )
      context.addIssue({ code: 'custom', message: '交易日覆盖必须无重复且完整分区' });
    if (
      Date.parse(bar.timestamp) !== Date.parse(bar.bucketEndAt) ||
      bar.bucketStartDate > bar.bucketEndDate ||
      bar.tradingDate !== bar.expectedTradingDates.at(-1)
    )
      context.addIssue({ code: 'custom', message: '桶边界与计划末交易日不一致' });
    if (
      bar.completionStatus === 'complete' &&
      (bar.missingTradingDates.length > 0 ||
        Date.parse(bar.availableAt) < Date.parse(bar.bucketEndAt))
    )
      context.addIssue({ code: 'custom', message: '完整周期必须结束且没有未解释缺口' });
    if (
      bar.high < Math.max(bar.open, bar.close, bar.low) ||
      bar.low > Math.min(bar.open, bar.close, bar.high)
    )
      context.addIssue({ code: 'custom', message: 'OHLC 价格范围不一致' });
  });

export const marketPeriodDerivationSchema = z.strictObject({
  ruleVersion: marketPeriodRuleVersionSchema,
  calendarRevision: text,
  baseInputFingerprint: fingerprint,
  priceBasisFingerprint: fingerprint,
  evaluationAsOf: instant,
  anchorTradingDate: date.optional(),
  coverageEvidence: z.array(marketPeriodNoTradingEvidenceSchema),
});

export const marketPeriodProvenanceSchema = z.strictObject({
  kind: z.literal('derived'),
  provider: z.literal('thesis-ledger-server'),
  providerRevision: marketPeriodRuleVersionSchema,
  baseSources: z
    .array(
      z.strictObject({
        providerId: text,
        upstreamSource: text,
        providerRevision: text,
        inputFingerprint: fingerprint,
        priceBasisFingerprint: fingerprint,
      }),
    )
    .min(1),
});

/** Server 展示序列；不属于 Provider Route/Data 原始事实协议。 */
export const marketPeriodBarSeriesSchema = z
  .strictObject({
    contractVersion: z.literal(3),
    identity: barSeriesIdentitySchema.extend({
      assetType: z.enum(['STOCK', 'ETF']),
      timeframe: marketDerivedTimeframeSchema,
    }),
    points: z.array(marketPeriodBarSchema),
    coverage: barSeriesCoverageSchema,
    provenance: marketPeriodProvenanceSchema,
    derivation: marketPeriodDerivationSchema,
    inputFingerprint: fingerprint,
  })
  .superRefine((series, context) => {
    if (
      (series.identity.timeframe === '5d') !==
      (series.derivation.anchorTradingDate !== undefined)
    )
      context.addIssue({
        code: 'custom',
        path: ['derivation', 'anchorTradingDate'],
        message: '5d 必须携带锚点，其他周期不得携带',
      });
    series.points.forEach((bar, index) => {
      if (
        Date.parse(bar.availableAt) > Date.parse(series.derivation.evaluationAsOf) ||
        (bar.completionStatus === 'complete' &&
          Date.parse(bar.bucketEndAt) > Date.parse(series.derivation.evaluationAsOf))
      )
        context.addIssue({
          code: 'custom',
          path: ['points', index],
          message: '不能在评估时刻前使用未来数据或声称周期完成',
        });
      if (index > 0 && Date.parse(series.points[index - 1]!.timestamp) >= Date.parse(bar.timestamp))
        context.addIssue({
          code: 'custom',
          path: ['points', index],
          message: '周期 bar 必须严格递增且唯一',
        });
    });
    if (
      series.coverage.actualStart !== (series.points[0]?.timestamp ?? null) ||
      series.coverage.actualEnd !== (series.points.at(-1)?.timestamp ?? null)
    )
      context.addIssue({ code: 'custom', path: ['coverage'], message: '实际边界必须匹配派生点' });
    if (
      series.provenance.baseSources.some(
        (source) => source.priceBasisFingerprint !== series.derivation.priceBasisFingerprint,
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['provenance'],
        message: '基础来源价格口径必须一致',
      });
    const evidenceDates = new Set<string>();
    series.derivation.coverageEvidence.forEach((evidence, index) => {
      if (
        evidenceDates.has(evidence.tradingDate) ||
        evidence.symbol !== series.identity.symbol ||
        evidence.calendarRevision !== series.derivation.calendarRevision ||
        evidence.baseInputFingerprint !== series.derivation.baseInputFingerprint ||
        Date.parse(evidence.availableAt) > Date.parse(series.derivation.evaluationAsOf)
      )
        context.addIssue({
          code: 'custom',
          path: ['derivation', 'coverageEvidence', index],
          message: '覆盖证据必须唯一且绑定同次派生上下文',
        });
      evidenceDates.add(evidence.tradingDate);
    });
    const explainedDates = series.points.flatMap((bar) => bar.explainedTradingDates);
    if (
      explainedDates.length !== evidenceDates.size ||
      explainedDates.some((day) => !evidenceDates.has(day))
    )
      context.addIssue({
        code: 'custom',
        path: ['derivation', 'coverageEvidence'],
        message: '解释缺日必须保留实际使用的证据',
      });
    series.points.forEach((bar, index) => {
      const used = series.derivation.coverageEvidence.filter((evidence) =>
        bar.explainedTradingDates.includes(evidence.tradingDate),
      );
      if (used.some((evidence) => Date.parse(evidence.availableAt) > Date.parse(bar.availableAt)))
        context.addIssue({
          code: 'custom',
          path: ['points', index, 'availableAt'],
          message: '派生可得时刻不得早于必要覆盖证据',
        });
    });
  });
export type MarketPeriodBarSeries = z.infer<typeof marketPeriodBarSeriesSchema>;
