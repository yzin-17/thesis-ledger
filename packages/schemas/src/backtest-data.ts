import { z } from 'zod';
import { nonNegativeDecimalStringSchema, positiveDecimalStringSchema } from './ledger-v2.js';

const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();

export const backtestMarketSchema = z.enum(['CN', 'HK', 'US']);
export const backtestInstrumentTypeSchema = z.enum(['STOCK', 'ETF', 'NAV_FUND']);
export const dataCapabilityStatusSchema = z.enum(['supported', 'unavailable', 'unsupported']);
export const dataTimeframeKindSchema = z.enum(['base', 'derived']);
export const dataFreshnessSchema = z.enum(['live', 'delayed', 'stale', 'unknown']);
export const dataQualitySchema = z.enum(['complete', 'partial', 'suspended', 'stale', 'unknown']);

export const dataRangeSchema = z.object({
  start: isoDate.nullable(),
  end: isoDate.nullable(),
});

export const dataCapabilitySchema = z.object({
  market: backtestMarketSchema,
  instrumentType: backtestInstrumentTypeSchema,
  timeframe: z.enum(['1m', '1d', '5m', '15m', '30m', '60m']),
  kind: dataTimeframeKindSchema,
  status: dataCapabilityStatusSchema,
  provider: z.string().min(1),
  providerRevision: z.string().min(1),
  range: dataRangeSchema,
  freshness: dataFreshnessSchema,
  quality: dataQualitySchema,
  completeness: z.enum(['complete', 'partial', 'unavailable']),
  timezone: z.string().min(1),
  reason: z.string().min(1).optional(),
  availableAt: isoDateTime.optional(),
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

export const instrumentFactSchema = z.object({
  symbol: z.string().min(1),
  market: backtestMarketSchema,
  instrumentType: backtestInstrumentTypeSchema,
  currency: z.enum(['CNY', 'HKD', 'USD']),
  lotSize: positiveDecimalStringSchema,
  tickSize: positiveDecimalStringSchema,
  tradable: z.boolean(),
  provider: z.string().min(1),
  providerRevision: z.string().min(1),
  occurredAt: isoDateTime,
  availableAt: isoDateTime,
});

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
    type: z.enum(['CASH_DIVIDEND', 'SPLIT', 'REVERSE_SPLIT']),
    ratio: positiveDecimalStringSchema.optional(),
    cashAmount: nonNegativeDecimalStringSchema.optional(),
    currency: z.enum(['CNY', 'HKD', 'USD']).optional(),
    occurredAt: isoDateTime,
    availableAt: isoDateTime,
    provider: z.string().min(1),
    providerRevision: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
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
  version: z.literal(2),
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
  })
  .strict();

export const backtestCorporateActionsResponseSchema = z
  .object({
    ...dependencyResponseShape,
    facts: z.array(corporateActionFactSchema),
  })
  .strict();

export const backtestCapabilitiesSchema = z.object({
  version: z.literal(2),
  provider: z.string().min(1),
  generatedAt: isoDateTime,
  capabilities: z.array(dataCapabilitySchema).min(1),
  calendars: z.array(tradingCalendarFactSchema),
  instrumentFacts: z.array(instrumentFactSchema),
  fx: z.object({
    status: dataCapabilityStatusSchema,
    facts: z.array(backtestFxFactSchema),
    reason: z.string().min(1).optional(),
  }),
  corporateActions: z.object({
    status: dataCapabilityStatusSchema,
    facts: z.array(corporateActionFactSchema),
    reason: z.string().min(1).optional(),
  }),
  nav: z.object({
    status: dataCapabilityStatusSchema,
    facts: z.array(backtestNavFactSchema),
    reason: z.string().min(1).optional(),
  }),
});

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
export type DataCapability = z.infer<typeof dataCapabilitySchema>;
export type BacktestCapabilities = z.infer<typeof backtestCapabilitiesSchema>;
export type TradingCalendarFact = z.infer<typeof tradingCalendarFactSchema>;
export type InstrumentFact = z.infer<typeof instrumentFactSchema>;
export type BacktestFxFact = z.infer<typeof backtestFxFactSchema>;
export type CorporateActionFact = z.infer<typeof corporateActionFactSchema>;
export type BacktestNavFact = z.infer<typeof backtestNavFactSchema>;
export type BacktestDependencyCoverage = z.infer<typeof backtestDependencyCoverageSchema>;
export type BacktestCalendarResponse = z.infer<typeof backtestCalendarResponseSchema>;
export type BacktestInstrumentFactsResponse = z.infer<typeof backtestInstrumentFactsResponseSchema>;
export type BacktestCorporateActionsResponse = z.infer<
  typeof backtestCorporateActionsResponseSchema
>;
export type BacktestMinuteBar = z.infer<typeof backtestMinuteBarSchema>;
export type BacktestDailyBar = z.infer<typeof backtestDailyBarSchema>;
