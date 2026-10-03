import { z } from 'zod';
import { sourcePriceBasisSchema } from './market-price-protocol.js';

const isoDateTime = z.iso.datetime({ offset: true });

export const barSeriesIdentitySchema = z.object({
  symbol: z.string().min(1),
  assetType: z.enum(['STOCK', 'ETF', 'MUTUAL_FUND', 'LOF', 'INDEX', 'BOND', 'CONVERTIBLE_BOND']),
  timeframe: z.enum(['1m', '1d']),
  adjustment: z.enum(['none', 'qfq', 'hfq']),
});
export type BarSeriesIdentity = z.infer<typeof barSeriesIdentitySchema>;

export const barPointSchema = z.object({
  timestamp: isoDateTime,
  open: z.number().finite().nonnegative(),
  high: z.number().finite().nonnegative(),
  low: z.number().finite().nonnegative(),
  close: z.number().finite().nonnegative(),
  volume: z.number().finite().nonnegative(),
  amount: z.number().finite().nonnegative(),
  completionStatus: z.enum(['complete', 'incomplete', 'unknown']),
  availableAt: isoDateTime,
});
export type BarPoint = z.infer<typeof barPointSchema>;

const barPointsSchema = z.array(barPointSchema).superRefine((points, context) => {
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    if (index > 0 && point.timestamp <= points[index - 1]!.timestamp) {
      context.addIssue({ code: 'custom', path: [index, 'timestamp'], message: 'timestamp 必须严格递增且唯一' });
    }
    if (point.high < Math.max(point.open, point.close, point.low)) {
      context.addIssue({ code: 'custom', path: [index, 'high'], message: 'high 必须不低于 OHLC 其余价格' });
    }
    if (point.low > Math.min(point.open, point.close, point.high)) {
      context.addIssue({ code: 'custom', path: [index, 'low'], message: 'low 必须不高于 OHLC 其余价格' });
    }
  }
});

const normalizeCanonicalNumber = (value: number | null) => {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new Error('canonical fingerprint 只接受有限数字');
  const raw = value.toPrecision(17);
  const [mantissa = '', exponentText] = raw.toLowerCase().split('e');
  if (exponentText === undefined) return mantissa.includes('.') ? mantissa.replace(/0+$/, '').replace(/\.$/, '') : mantissa;
  const exponent = Number(exponentText);
  const sign = mantissa.startsWith('-') ? '-' : '';
  const digits = mantissa.replace('-', '').replace('.', '');
  const decimalIndex = (mantissa.startsWith('-') ? mantissa.indexOf('.') - 1 : mantissa.indexOf('.')) + exponent;
  const shifted = decimalIndex <= 0 ? `0.${'0'.repeat(-decimalIndex)}${digits}` : decimalIndex >= digits.length ? `${digits}${'0'.repeat(decimalIndex - digits.length)}` : `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  return `${sign}${shifted}`.replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1');
};

export const canonicalBarSeriesEncoding = (
  identity: BarSeriesIdentity,
  points: readonly BarPoint[],
) =>
  JSON.stringify([
    [identity.symbol, identity.assetType, identity.timeframe, identity.adjustment],
    [...points]
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .map((point) => [
        point.timestamp,
        normalizeCanonicalNumber(point.open),
        normalizeCanonicalNumber(point.high),
        normalizeCanonicalNumber(point.low),
        normalizeCanonicalNumber(point.close),
        normalizeCanonicalNumber(point.volume),
        normalizeCanonicalNumber(point.amount),
        point.completionStatus,
        point.availableAt,
      ]),
  ]);

export const routeProvenanceSchema = z.object({
  providerId: z.string().min(1),
  upstreamSource: z.string().min(1),
  routeIndex: z.number().int().nonnegative(),
  effectivePolicyRevision: z.number().int().nonnegative(),
  providerRevision: z.string().min(1),
  fetchedAt: isoDateTime,
  freshUntil: isoDateTime,
  servedFromCache: z.boolean(),
  cacheStatus: z.enum(['miss', 'memory', 'redis', 'postgres', 'stale']),
});
export type RouteProvenance = z.infer<typeof routeProvenanceSchema>;

export const barSeriesCoverageSchema = z.object({
  actualStart: isoDateTime.nullable(),
  actualEnd: isoDateTime.nullable(),
  hasMoreBefore: z.boolean(),
  latestCompleteTradingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export const barSeriesSchema = z.object({
  contractVersion: z.literal(3),
  identity: barSeriesIdentitySchema,
  points: barPointsSchema,
  coverage: barSeriesCoverageSchema,
  provenance: routeProvenanceSchema,
  inputFingerprint: z.string().min(1),
  chartContextV3: z.strictObject({
    purpose: z.literal('interactive-chart'),
    sourcePriceBasis: sourcePriceBasisSchema,
    requestedStart: z.iso.date(),
    requestedEnd: z.iso.date(),
    acquisitionFingerprint: z.string().min(1),
  }).optional(),
});
export type BarSeries = z.infer<typeof barSeriesSchema>;

export const indicatorRequestSchema = z.object({
  name: z.enum(['MA', 'MACD', 'RSI']),
  parameters: z.record(z.string(), z.number().int().positive()),
});

export const indicatorCalculateRequestSchema = z.object({
  contractVersion: z.literal(3),
  identity: barSeriesIdentitySchema,
  inputFingerprint: z.string().min(1),
  points: barPointsSchema,
  requests: z.array(indicatorRequestSchema).min(1),
}).superRefine((request, context) => {
  const seen = new Set<string>();
  for (const [index, item] of request.requests.entries()) {
    const key = `${item.name}:${JSON.stringify(Object.entries(item.parameters).sort())}`;
    if (seen.has(key)) context.addIssue({ code: 'custom', path: ['requests', index], message: '指标请求不得重复' });
    seen.add(key);
  }
});
export type IndicatorCalculateRequest = z.infer<typeof indicatorCalculateRequestSchema>;

const marketIndicatorPointsSchema = z.array(z.object({
  timestamp: isoDateTime,
  values: z.record(z.string(), z.number().finite().nullable()),
})).superRefine((points, context) => {
  for (let index = 1; index < points.length; index += 1) {
    if (points[index - 1]!.timestamp >= points[index]!.timestamp) {
      context.addIssue({ code: 'custom', path: [index, 'timestamp'], message: '指标点必须按时间严格递增' });
    }
  }
});

export const marketIndicatorResultSchema = z.object({
  name: z.enum(['MA', 'MACD', 'RSI']),
  parameters: z.record(z.string(), z.number().int().positive()),
  // 原始 DSA 结果绑定完整输入；Server 显示投影绑定公开 BarSeries，并保留 calculationInput。
  inputFingerprint: z.string().min(1),
  calculationInput: z.object({
    inputFingerprint: z.string().min(1),
    actualStart: isoDateTime.nullable(),
    actualEnd: isoDateTime.nullable(),
    pointCount: z.number().int().nonnegative(),
  }).optional(),
  points: marketIndicatorPointsSchema,
});
export type MarketIndicatorResult = z.infer<typeof marketIndicatorResultSchema>;

export const indicatorCalculateResponseSchema = z.object({
  contractVersion: z.literal(3),
  engineVersion: z.string().min(1),
  inputFingerprint: z.string().min(1),
  results: z.array(marketIndicatorResultSchema),
}).superRefine((response, context) => {
  const seen = new Set<string>();
  for (const [index, result] of response.results.entries()) {
    if (result.inputFingerprint !== response.inputFingerprint) {
      context.addIssue({ code: 'custom', path: ['results', index, 'inputFingerprint'], message: '结果 fingerprint 必须与顶层一致' });
    }
    const key = `${result.name}:${JSON.stringify(Object.entries(result.parameters).sort())}`;
    if (seen.has(key)) context.addIssue({ code: 'custom', path: ['results', index], message: '指标结果不得重复' });
    seen.add(key);
  }
});
export type IndicatorCalculateResponse = z.infer<typeof indicatorCalculateResponseSchema>;
