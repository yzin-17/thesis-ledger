import { z } from 'zod';

const isoDateTime = z.iso.datetime({ offset: true });

export const barSeriesIdentityV2Schema = z.object({
  symbol: z.string().min(1),
  assetType: z.enum(['STOCK', 'ETF', 'MUTUAL_FUND', 'LOF', 'INDEX', 'BOND', 'CONVERTIBLE_BOND']),
  timeframe: z.enum(['1m', '1d']),
  adjustment: z.enum(['none', 'qfq', 'hfq']),
});
export type BarSeriesIdentityV2 = z.infer<typeof barSeriesIdentityV2Schema>;

export const barPointV2Schema = z.object({
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
export type BarPointV2 = z.infer<typeof barPointV2Schema>;

const barPointsV2Schema = z.array(barPointV2Schema).superRefine((points, context) => {
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
  identity: BarSeriesIdentityV2,
  points: readonly BarPointV2[],
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

export const routeProvenanceV2Schema = z.object({
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
export type RouteProvenanceV2 = z.infer<typeof routeProvenanceV2Schema>;

export const barSeriesCoverageV2Schema = z.object({
  actualStart: isoDateTime.nullable(),
  actualEnd: isoDateTime.nullable(),
  hasMoreBefore: z.boolean(),
  latestCompleteTradingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export const barSeriesV2Schema = z.object({
  contractVersion: z.literal(2),
  identity: barSeriesIdentityV2Schema,
  points: barPointsV2Schema,
  coverage: barSeriesCoverageV2Schema,
  provenance: routeProvenanceV2Schema,
  inputFingerprint: z.string().min(1),
});
export type BarSeriesV2 = z.infer<typeof barSeriesV2Schema>;

export const indicatorRequestV2Schema = z.object({
  name: z.enum(['MA', 'MACD', 'RSI']),
  parameters: z.record(z.string(), z.number().int().positive()),
});

export const indicatorCalculateRequestV2Schema = z.object({
  contractVersion: z.literal(2),
  identity: barSeriesIdentityV2Schema,
  inputFingerprint: z.string().min(1),
  points: barPointsV2Schema,
  requests: z.array(indicatorRequestV2Schema).min(1),
}).superRefine((request, context) => {
  const seen = new Set<string>();
  for (const [index, item] of request.requests.entries()) {
    const key = `${item.name}:${JSON.stringify(Object.entries(item.parameters).sort())}`;
    if (seen.has(key)) context.addIssue({ code: 'custom', path: ['requests', index], message: '指标请求不得重复' });
    seen.add(key);
  }
});
export type IndicatorCalculateRequestV2 = z.infer<typeof indicatorCalculateRequestV2Schema>;

export const indicatorResultV2Schema = z.object({
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
  points: z.array(
    z.object({
      timestamp: isoDateTime,
      values: z.record(z.string(), z.number().finite().nullable()),
    }),
  ),
});
export type IndicatorResultV2 = z.infer<typeof indicatorResultV2Schema>;

export const indicatorCalculateResponseV2Schema = z.object({
  contractVersion: z.literal(2),
  engineVersion: z.string().min(1),
  inputFingerprint: z.string().min(1),
  results: z.array(indicatorResultV2Schema),
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
export type IndicatorCalculateResponseV2 = z.infer<typeof indicatorCalculateResponseV2Schema>;
