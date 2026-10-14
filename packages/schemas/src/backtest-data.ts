import { z } from 'zod';
import { nonNegativeDecimalStringSchema, positiveDecimalStringSchema } from './monetary-values.js';
import { backtestDailyTradabilityEvidenceV3Schema } from './backtest-daily-tradability.js';

const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();

export const backtestMarketSchema = z.enum(['CN', 'HK', 'US']);
export const backtestInstrumentTypeSchema = z.enum(['STOCK', 'ETF', 'NAV_FUND']);
export const corporateActionTypeSchema = z.enum(['CASH_DIVIDEND', 'SPLIT', 'REVERSE_SPLIT']);
export const dataCapabilityStatusSchema = z.enum(['supported', 'unavailable', 'unsupported']);
export const dataFreshnessSchema = z.enum(['live', 'delayed', 'stale', 'unknown']);
export const dataQualitySchema = z.enum(['complete', 'partial', 'suspended', 'stale', 'unknown']);

export const dataRangeSchema = z.object({
  start: isoDate.nullable(),
  end: isoDate.nullable(),
});

export const calendarSessionSchema = z.object({
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});

export const calendarSessionOverrideSchema = z.object({
  date: isoDate,
  sessions: z.array(calendarSessionSchema),
});

export const tradingCalendarFactSchema = z.object({
  market: backtestMarketSchema,
  timezone: z.string().min(1),
  provider: z.string().min(1),
  providerRevision: z.string().min(1),
  availableAt: isoDateTime,
  sessions: z.array(calendarSessionSchema).min(1),
  sessionOverrides: z.array(calendarSessionOverrideSchema).default([]),
  holidays: z.array(isoDate),
  range: dataRangeSchema,
});

const executionRuleChargeSchema = z
  .object({
    code: z.string().min(1),
    side: z.enum(['buy', 'sell', 'both']),
    rate: nonNegativeDecimalStringSchema,
    minimum: nonNegativeDecimalStringSchema.nullable(),
  })
  .strict();

const supportedExecutionRuleSnapshotSchema = z
  .object({
    status: z.literal('supported'),
    version: z.string().min(1),
    range: z.object({ start: isoDate, end: isoDate }).strict(),
    price: z
      .object({
        reference: z.literal('previousClose'),
        maxUpRatio: nonNegativeDecimalStringSchema.nullable(),
        maxDownRatio: nonNegativeDecimalStringSchema.nullable(),
      })
      .strict(),
    positionSettlement: z
      .object({ sellableAfterTradingDays: z.number().int().nonnegative() })
      .strict(),
    cashSettlement: z
      .object({
        buyDebitAfterTradingDays: z.number().int().nonnegative(),
        sellCreditAfterTradingDays: z.number().int().nonnegative(),
      })
      .strict(),
    statutoryCharges: z.array(executionRuleChargeSchema),
  })
  .strict();

export const executionRuleSnapshotSchema = z.discriminatedUnion('status', [
  supportedExecutionRuleSnapshotSchema,
  z.object({ status: z.literal('unavailable'), reason: z.string().min(1) }).strict(),
]);

export const instrumentFactSchema = z
  .object({
    symbol: z.string().min(1),
    market: backtestMarketSchema,
    instrumentType: backtestInstrumentTypeSchema,
    currency: z.enum(['CNY', 'HKD', 'USD']),
    lotSize: positiveDecimalStringSchema.nullable(),
    tickSize: positiveDecimalStringSchema.nullable(),
    tradable: z.boolean(),
    executionRules: executionRuleSnapshotSchema,
    provider: z.string().min(1),
    providerRevision: z.string().min(1),
    occurredAt: isoDateTime,
    availableAt: isoDateTime,
  })
  .superRefine((value, context) => {
    if ((value.lotSize === null) !== (value.tickSize === null))
      context.addIssue({
        code: 'custom',
        path: ['lotSize'],
        message: '未核实市场单位时，整手与价位必须成对保留未知',
      });
  });

/**
 * Explicit point-in-time evidence for using a corporate action as a strategy signal.
 * Date-only visibility is supplied by the source/adapter and becomes usable only
 * after that date's close, at the next eligible trading session.
 */
export const corporateActionStrategyVisibilitySchema = z.discriminatedUnion('kind', [
  z
    .strictObject({
      kind: z.literal('announcement'),
      announcedAt: isoDateTime,
    })
    .describe('来源明确提供的公告可见时间'),
  z
    .strictObject({
      kind: z.literal('conservative-day'),
      visibleDate: isoDate,
    })
    .describe('来源明确提供的可见日；收盘后可见，最早下一有效交易时段可用'),
]);

export const backtestFxFactSchema = z.object({
  fromCurrency: z.enum(['CNY', 'HKD', 'USD']),
  toCurrency: z.enum(['CNY', 'HKD', 'USD']),
  rate: positiveDecimalStringSchema.nullable(),
  occurredAt: isoDateTime,
  availableAt: isoDateTime,
  provider: z.string().min(1),
  providerRevision: z.string().min(1),
  freshness: dataFreshnessSchema,
  quality: dataQualitySchema,
});

export const corporateActionFactSchema = z
  .object({
    symbol: z.string().min(1),
    market: backtestMarketSchema,
    instrumentType: backtestInstrumentTypeSchema,
    type: corporateActionTypeSchema,
    ratio: positiveDecimalStringSchema.optional(),
    cashAmount: nonNegativeDecimalStringSchema.optional(),
    currency: z.enum(['CNY', 'HKD', 'USD']).optional(),
    /** Explicit economic impact date; it is never derived from occurredAt or availableAt. */
    effectiveDate: isoDate.optional(),
    recordDate: isoDate.optional(),
    paymentDate: isoDate.optional(),
    /**
     * Optional point-in-time evidence for event-driven signals. Legacy availableAt
     * is provider fact availability and must not be treated as announcement time.
     */
    strategyVisibility: corporateActionStrategyVisibilitySchema.optional(),
    /** Legacy occurrence timestamp; it is not a substitute for effectiveDate. */
    occurredAt: isoDateTime,
    /** Legacy/provider fact availability; it is not a substitute for strategyVisibility. */
    availableAt: isoDateTime,
    provider: z.string().min(1),
    providerRevision: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.recordDate !== undefined || value.paymentDate !== undefined) &&
      !value.effectiveDate
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['effectiveDate'],
        message: '登记或发放日期需要明确生效日',
      });
    }
    if (value.strategyVisibility !== undefined && value.effectiveDate === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['effectiveDate'],
        message: '事件信号必须明确提供 effectiveDate',
      });
    }
    if (value.type === 'CASH_DIVIDEND') {
      if (value.cashAmount === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['cashAmount'],
          message: '现金分红必须提供 cashAmount',
        });
      }
      if (value.currency === undefined) {
        ctx.addIssue({ code: 'custom', path: ['currency'], message: '现金分红必须提供 currency' });
      }
      if (value.ratio !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['ratio'], message: '现金分红不接受 ratio' });
      }
      return;
    }
    if (value.ratio === undefined) {
      ctx.addIssue({ code: 'custom', path: ['ratio'], message: '拆并股必须提供 ratio' });
    }
    if (value.cashAmount !== undefined || value.currency !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['cashAmount'], message: '拆并股不接受现金分红字段' });
    }
  });

export const backtestNavFactSchema = z.object({
  symbol: z.string().min(1),
  market: z.literal('CN'),
  instrumentType: z.literal('NAV_FUND'),
  nav: positiveDecimalStringSchema.nullable(),
  valuationDate: isoDate,
  occurredAt: isoDateTime,
  availableAt: isoDateTime,
  provider: z.string().min(1),
  providerRevision: z.string().min(1),
  freshness: dataFreshnessSchema,
  quality: dataQualitySchema,
  status: dataCapabilityStatusSchema,
  reason: z.string().min(1).optional(),
});

export const backtestDependencyCoverageSchema = z
  .object({
    start: isoDate.nullable(),
    end: isoDate.nullable(),
    complete: z.boolean(),
  })
  .strict();

const dependencyResponseShape = {
  version: z.literal(3),
  status: dataCapabilityStatusSchema,
  provider: z.string().min(1),
  providerRevision: z.string().min(1),
  coverage: backtestDependencyCoverageSchema,
  reason: z.string().min(1).nullable().optional(),
};

export const backtestCalendarResponseSchema = z
  .object({
    ...dependencyResponseShape,
    facts: z.array(tradingCalendarFactSchema),
  })
  .strict();

export const backtestInstrumentFactsResponseSchema = z
  .object({
    ...dependencyResponseShape,
    facts: z.array(instrumentFactSchema),
    historicalTradability: backtestDailyTradabilityEvidenceV3Schema.optional(),
    historicalTradabilityWindows: z
      .array(backtestDailyTradabilityEvidenceV3Schema)
      .min(1)
      .max(1_000)
      .optional(),
    missingInputs: z
      .array(
        z.strictObject({
          field: z.string().min(1),
          category: z.enum(['criticalFact', 'modelAssumption']),
          range: z.strictObject({ start: isoDate, end: isoDate }),
          provider: z.string().min(1),
          reason: z.string().min(1),
        }),
      )
      .optional(),
  })
  .strict();

export const backtestInstrumentFactsRequestSchema = z
  .strictObject({
    symbol: z.string().min(1),
    market: backtestMarketSchema,
    instrumentType: backtestInstrumentTypeSchema,
    start: isoDate,
    end: isoDate,
    executionStart: isoDate,
    executionEnd: isoDate,
    dataAsOf: isoDateTime,
    barAdjustment: z.enum(['none', 'qfq', 'hfq']).optional(),
    barProviderId: z.string().trim().min(1).optional(),
    barUpstreamSource: z.string().trim().min(1).optional(),
    barRouteIndex: z.number().int().min(0).max(1).optional(),
    identityOnly: z.literal(true).optional(),
  })
  .superRefine((value, ctx) => {
    const sourceFields = [
      value.barAdjustment,
      value.barProviderId,
      value.barUpstreamSource,
      value.barRouteIndex,
    ];
    if (
      sourceFields.some((field) => field !== undefined) &&
      sourceFields.some((field) => field === undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['barProviderId'],
        message: '日线来源参数必须成组提供',
      });
    }
    if (
      value.start > value.executionStart ||
      value.executionStart > value.executionEnd ||
      value.executionEnd > value.end
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['executionStart'],
        message: '事实范围必须包含有效的执行范围',
      });
    }
    const dataAsOf = Date.parse(value.dataAsOf);
    if (Number.isFinite(dataAsOf) && value.end > new Date(dataAsOf).toISOString().slice(0, 10)) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: '事实范围不能晚于 dataAsOf' });
    }
  });

export type BacktestInstrumentFactsRequest = z.infer<typeof backtestInstrumentFactsRequestSchema>;

export const backtestCorporateActionsResponseSchema = z
  .object({
    ...dependencyResponseShape,
    facts: z.array(corporateActionFactSchema),
  })
  .strict();

const backtestBarShape = z.object({
  symbol: z.string().min(1),
  market: backtestMarketSchema,
  occurredAt: isoDateTime,
  availableAt: isoDateTime,
  openedAt: isoDateTime.optional(),
  openAvailableAt: isoDateTime.optional(),
  open: nonNegativeDecimalStringSchema,
  high: nonNegativeDecimalStringSchema,
  low: nonNegativeDecimalStringSchema,
  close: nonNegativeDecimalStringSchema,
  volume: nonNegativeDecimalStringSchema,
  amount: nonNegativeDecimalStringSchema.optional(),
  provider: z.string().min(1),
  providerRevision: z.string().min(1),
  quality: dataQualitySchema,
  suspended: z.boolean().optional(),
});

const decimalParts = (value: string) => {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer, fraction = ''] = unsigned.split('.');
  const coefficient = BigInt(`${integer}${fraction}`) * (negative ? -1n : 1n);
  return { coefficient, scale: fraction.length };
};

const compareDecimalStrings = (left: string, right: string) => {
  const leftParts = decimalParts(left);
  const rightParts = decimalParts(right);
  const scale = Math.max(leftParts.scale, rightParts.scale);
  const leftCoefficient = leftParts.coefficient * 10n ** BigInt(scale - leftParts.scale);
  const rightCoefficient = rightParts.coefficient * 10n ** BigInt(scale - rightParts.scale);
  if (leftCoefficient < rightCoefficient) return -1;
  if (leftCoefficient > rightCoefficient) return 1;
  return 0;
};

const validBacktestBar = <T extends { high: string; low: string; open: string; close: string }>(
  bar: T,
) => {
  if (compareDecimalStrings(bar.high, bar.open) < 0) return false;
  if (compareDecimalStrings(bar.high, bar.low) < 0) return false;
  if (compareDecimalStrings(bar.high, bar.close) < 0) return false;
  if (compareDecimalStrings(bar.low, bar.open) > 0) return false;
  if (compareDecimalStrings(bar.low, bar.close) > 0) return false;
  return true;
};

export const backtestMinuteBarSchema = backtestBarShape
  .extend({ timeframe: z.literal('1m') })
  .refine(validBacktestBar, 'OHLC 价格范围非法');

export const backtestDailyBarSchema = backtestBarShape
  .extend({ timeframe: z.literal('1d') })
  .refine(validBacktestBar, 'OHLC 价格范围非法');

export type BacktestMarket = z.infer<typeof backtestMarketSchema>;
export type BacktestInstrumentType = z.infer<typeof backtestInstrumentTypeSchema>;
export type TradingCalendarFact = z.infer<typeof tradingCalendarFactSchema>;
export type InstrumentFact = z.infer<typeof instrumentFactSchema>;
export type ExecutionRuleSnapshot = z.infer<typeof executionRuleSnapshotSchema>;
export type BacktestFxFact = z.infer<typeof backtestFxFactSchema>;
export type CorporateActionFact = z.infer<typeof corporateActionFactSchema>;
export type CorporateActionType = z.infer<typeof corporateActionTypeSchema>;
export type CorporateActionStrategyVisibility = z.infer<
  typeof corporateActionStrategyVisibilitySchema
>;
export type BacktestNavFact = z.infer<typeof backtestNavFactSchema>;
export type BacktestDependencyCoverage = z.infer<typeof backtestDependencyCoverageSchema>;
export type BacktestCalendarResponse = z.infer<typeof backtestCalendarResponseSchema>;
export type BacktestInstrumentFactsResponse = z.infer<typeof backtestInstrumentFactsResponseSchema>;
export type BacktestCorporateActionsResponse = z.infer<
  typeof backtestCorporateActionsResponseSchema
>;
export type BacktestMinuteBar = z.infer<typeof backtestMinuteBarSchema>;
export type BacktestDailyBar = z.infer<typeof backtestDailyBarSchema>;

export {
  benchmarkExecutionModelCostVersionV3,
  wholeShareWindowBenchmarkCostVersionV3,
  researchLotShareWindowBenchmarkCostVersionV3,
  backtestSnapshotActualSourceV3Schema,
  backtestSnapshotManifestV3Schema,
} from './backtest-snapshot-manifest-v3.js';
export type {
  BacktestSnapshotActualSourceV3,
  BacktestSnapshotManifestV3,
} from './backtest-snapshot-manifest-v3.js';
