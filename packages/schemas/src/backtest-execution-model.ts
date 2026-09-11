import { z } from 'zod';
import { nonNegativeDecimalStringSchema, positiveDecimalStringSchema } from './ledger-v2.js';

const currency = z.enum(['CNY', 'HKD', 'USD']);
const dateRange = z
  .strictObject({ start: z.iso.date(), end: z.iso.date() })
  .refine((value) => value.start <= value.end, { message: '区间起点不能晚于终点', path: ['end'] });
const text = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });
const provenance = { description: text, references: z.array(text).min(1), revision: text };

export const executionModelSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('historicalFact'), ...provenance, knownAt: timestamp }),
  z.strictObject({ kind: z.literal('researchPreset'), ...provenance, configuredAt: timestamp }),
  z.strictObject({ kind: z.literal('userConfiguration'), ...provenance, configuredAt: timestamp }),
]);

const minimum = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('amount'), amount: positiveDecimalStringSchema }),
]);
const charged = z.strictObject({
  treatment: z.literal('charged'),
  side: z.enum(['buy', 'sell', 'both']),
  basis: z.literal('turnover'),
  currency,
  rate: nonNegativeDecimalStringSchema,
  minimum,
});
const fee = z.discriminatedUnion('treatment', [
  charged,
  z.strictObject({ treatment: z.literal('includedInCommission'), reason: text }),
  z.strictObject({ treatment: z.literal('notApplicable'), reason: text }),
]);
const navFeeCollection = {
  currency: z.literal('CNY'),
  collection: z.literal('perApplication'),
  collectedAt: z.literal('confirmation'),
};
const navChargedFee = {
  rate: nonNegativeDecimalStringSchema,
  minimum,
  rounding: z.strictObject({ mode: z.literal('halfUp'), decimalPlaces: z.literal(2) }),
};
const navFee = <S extends 'buy' | 'sell', B extends string>(side: S, basis: B) =>
  z.discriminatedUnion('treatment', [
    z.strictObject({
      treatment: z.literal('charged'),
      side: z.literal(side),
      basis: z.literal(basis),
      ...navFeeCollection,
      ...navChargedFee,
    }),
    z.strictObject({
      treatment: z.literal('notApplicable'),
      side: z.literal(side),
      basis: z.literal(basis),
      ...navFeeCollection,
      reason: text,
    }),
  ]);
const navSubscriptionFee = navFee('buy', 'subscriptionApplicationAmount');
const navRedemptionFee = navFee('sell', 'redemptionGrossProceeds');

export const executionModelFeesSchema = z
  .strictObject({
    currency,
    rounding: z.strictObject({ mode: z.literal('halfUp'), decimalPlaces: z.literal(2) }),
    collection: z.literal('perFillPerCharge'),
    commission: charged,
    stampDuty: fee,
    transferFee: fee,
    regulatoryFee: fee,
    handlingFee: fee,
  })
  .superRefine((value, ctx) => {
    for (const key of [
      'commission',
      'stampDuty',
      'transferFee',
      'regulatoryFee',
      'handlingFee',
    ] as const) {
      const charge = value[key];
      if (charge.treatment === 'charged' && charge.currency !== value.currency) {
        ctx.addIssue({
          code: 'custom',
          path: [key, 'currency'],
          message: '费用币种必须与模型一致',
        });
      }
      if (charge.treatment === 'includedInCommission' && value.commission.side !== 'both') {
        ctx.addIssue({ code: 'custom', path: [key], message: '包含规费的佣金必须覆盖买卖两侧' });
      }
    }
  });

const tradingDays = z.number().int().min(0).max(30);
const exchange = z.strictObject({
  mode: z.literal('exchange'),
  calendarMarket: z.enum(['CN', 'HK', 'US']),
  reserveCashAt: z.literal('orderAccepted'),
  buyDebitAt: z.literal('fill'),
  sellableAfterTradingDays: tradingDays,
  saleReinvestableAfterTradingDays: tradingDays,
  price: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('dailyLimit'),
      reference: z.literal('previousRawClose'),
      maxUpRatio: positiveDecimalStringSchema,
      maxDownRatio: positiveDecimalStringSchema,
      rounding: z.literal('halfUpToTick'),
      minimumDistanceTicks: z.literal(1),
      minimumPriceTicks: z.literal(1),
    }),
    z.strictObject({ kind: z.literal('noDailyLimit'), reason: text }),
  ]),
});
const nav = z.strictObject({
  mode: z.literal('nav'),
  calendarMarket: z.literal('CN'),
  cutoffLocalTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  cutoffBoundary: z.literal('atOrAfterNextTradingDay'),
  navDate: z.literal('acceptedApplicationTradingDate'),
  navAvailability: z.literal('providerAvailableAt'),
  reserveCashAt: z.literal('orderAccepted'),
  subscriptionDebitAt: z.literal('confirmation'),
  confirmationAfterTradingDays: tradingDays,
  sellableAfterConfirmationTradingDays: tradingDays,
  redemptionReinvestableAfterConfirmationTradingDays: tradingDays,
  subscriptionFee: navSubscriptionFee,
  redemptionFee: navRedemptionFee,
});

const segmentMetadata = {
  id: text,
  range: dateRange,
  source: executionModelSourceSchema,
  assumptions: z.array(text),
};
const segment = z.union([
  z.strictObject({ ...segmentMetadata, fees: executionModelFeesSchema, execution: exchange }),
  z.strictObject({ ...segmentMetadata, fees: z.null(), execution: nav }),
]);

export const backtestExecutionModelSchema = z
  .strictObject({
    schemaVersion: z.literal('execution-model-v1'),
    id: text,
    version: text,
    scope: z.strictObject({
      symbol: text,
      market: z.enum(['CN', 'HK', 'US']),
      instrumentType: z.enum(['STOCK', 'ETF', 'NAV_FUND']),
      currency,
      timezone: text.refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, '无效时区'),
      range: dateRange,
    }),
    segments: z.array(segment).min(1),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    let nextStart = value.scope.range.start;
    value.segments.forEach((item, index) => {
      const error = (field: string, message: string) =>
        ctx.addIssue({
          code: 'custom',
          path: ['segments', index, field],
          message,
        });
      if (ids.has(item.id)) error('id', '规则分段标识重复');
      ids.add(item.id);
      if (item.range.start !== nextStart) error('range', '规则分段缺口、重叠或顺序错误');
      nextStart = new Date(Date.parse(`${item.range.end}T00:00:00Z`) + 86_400_000)
        .toISOString()
        .slice(0, 10);
      if (item.fees && item.fees.currency !== value.scope.currency)
        error('fees', '模型费用与标的币种不一致');
      if (item.execution.calendarMarket !== value.scope.market)
        error('execution', '日历市场不一致');
      if ((item.execution.mode === 'nav') !== (value.scope.instrumentType === 'NAV_FUND')) {
        error('execution', '执行模型与资产类型不适用');
      }
      if (item.source.kind !== 'historicalFact' && item.assumptions.length === 0) {
        error('assumptions', '研究配置必须明确简化假设');
      }
      if (item.execution.mode === 'nav') {
        if (value.scope.currency !== 'CNY') error('execution', 'CN NAV 执行币种必须为 CNY');
        for (const key of ['subscriptionFee', 'redemptionFee'] as const) {
          if (item.execution[key].currency !== value.scope.currency)
            error('execution', 'NAV 费用币种不一致');
        }
      }
    });
    if (value.segments.at(-1)?.range.end !== value.scope.range.end) {
      ctx.addIssue({ code: 'custom', path: ['segments'], message: '分段必须恰好覆盖模型适用范围' });
    }
  });

export type BacktestExecutionModel = z.infer<typeof backtestExecutionModelSchema>;
export const executionModelDisclosureSchema = z.strictObject({
  model: backtestExecutionModelSchema,
  contentHash: text.optional(),
});
export type ExecutionModelDisclosure = z.infer<typeof executionModelDisclosureSchema>;
export type ExecutionModelFees = z.infer<typeof executionModelFeesSchema>;

/** Date-scoped historical rules must be known before their first applicable day. */
export const executionModelRunIssues = (
  model: BacktestExecutionModel,
  run: { startDate: string; endDate: string; dataAsOf: string },
  instrument?: { symbol: string; market: string; assetType: string },
): { path: (string | number)[]; message: string }[] => {
  const issues: { path: (string | number)[]; message: string }[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en', {
      timeZone: model.scope.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    add(['scope', 'timezone'], '模型时区无效');
    return issues;
  }
  if (model.scope.range.start > run.startDate || model.scope.range.end < run.endDate) {
    add(['scope', 'range'], '模型未覆盖运行日期范围');
  }
  if (instrument) {
    const types: Record<string, string> = { stock: 'STOCK', etf: 'ETF', fund: 'NAV_FUND' };
    const currencies: Record<string, string> = { CN: 'CNY', HK: 'HKD', US: 'USD' };
    for (const key of ['symbol', 'market'] as const) {
      if (model.scope[key] !== instrument[key]) add(['scope', key], '模型与执行标的不一致');
    }
    if (model.scope.instrumentType !== types[instrument.assetType])
      add(['scope', 'instrumentType'], '模型资产类型不一致');
    if (model.scope.currency !== currencies[instrument.market])
      add(['scope', 'currency'], '模型执行币种不一致');
  }
  model.segments.forEach((segment, index) => {
    if (segment.range.end < run.startDate || segment.range.start > run.endDate) return;
    if (segment.source.kind !== 'historicalFact') return;
    const known = Date.parse(segment.source.knownAt);
    if (!Number.isFinite(known)) return;
    const firstDate = segment.range.start > run.startDate ? segment.range.start : run.startDate;
    const local = Object.fromEntries(
      formatter.formatToParts(known).map((part) => [part.type, part.value]),
    );
    const localTime = `${local.year}-${local.month}-${local.day}T${local.hour}:${local.minute}:${local.second}`;
    if (known > Date.parse(run.dataAsOf) || localTime >= `${firstDate}T00:00:00`) {
      add(
        ['segments', index, 'source', 'knownAt'],
        '历史规则必须在首个适用日的本地零点前且不晚于 dataAsOf 已知',
      );
    }
  });
  return issues;
};
