import { createHash } from 'node:crypto';
import {
  barSeriesSchema,
  canonicalBarSeriesEncoding,
  type BarPoint,
  type BarSeriesIdentity,
  type BarSeries,
} from '@thesis-ledger/schemas';

export type MarketBarWindow = { start?: string; end?: string; limit?: number };

const marketTimeZone = (symbol: string) => {
  if (symbol.endsWith('.HK')) return 'Asia/Hong_Kong';
  if (symbol.endsWith('.US') || /^[A-Z][A-Z0-9-]*(?:\.[A-Z])?$/.test(symbol))
    return 'America/New_York';
  return 'Asia/Shanghai';
};

const localMidnight = (date: string, timeZone: string) => {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = date.split('-').map(Number);
  const wanted = Date.UTC(year, month - 1, day);
  if (new Date(wanted).toISOString().slice(0, 10) !== date)
    throw new Error('行情窗口必须使用有效日历日期');
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let candidate = wanted;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    const rendered = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    if (rendered === wanted) return candidate;
    candidate += wanted - rendered;
  }
  throw new Error('行情窗口时区边界无法确定');
};

const normalizeBoundary = (value: string, symbol: string, end: boolean) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) throw new Error('行情窗口必须是有效时间');
    return new Date(timestamp).toISOString();
  }
  const timeZone = marketTimeZone(symbol);
  const start = localMidnight(value, timeZone);
  if (!end) return new Date(start).toISOString();
  const nextDate = new Date(`${value}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  // 使用下一本地午夜，而非固定加 24 小时，以覆盖美股夏令时切换。
  return new Date(localMidnight(nextDate.toISOString().slice(0, 10), timeZone) - 1).toISOString();
};

/** 日期窗口包含结束当日；完整时间戳保留精确时刻。数据库、缓存与最终切片共用此边界。 */
export const normalizeMarketBarWindow = (
  symbol: string,
  window: MarketBarWindow,
): MarketBarWindow => {
  const start = window.start ? normalizeBoundary(window.start, symbol, false) : undefined;
  const end = window.end ? normalizeBoundary(window.end, symbol, true) : undefined;
  if (start && end && start > end) throw new Error('start 不能晚于 end');
  return {
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(window.limit !== undefined ? { limit: window.limit } : {}),
  };
};

const canonicalPoints = (points: readonly BarPoint[]) =>
  points
    .map((point) => ({ ...point }))
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));

export const barSeriesInputFingerprint = (
  identity: BarSeriesIdentity,
  points: readonly BarPoint[],
) =>
  createHash('sha256')
    .update(canonicalBarSeriesEncoding(identity, canonicalPoints(points)))
    .digest('hex');

/** 对返回窗口切片并重新计算指纹；内部缓存字段不进入公开响应。 */
export const sliceBarSeries = (series: BarSeries, requested: MarketBarWindow): BarSeries => {
  const window = normalizeMarketBarWindow(series.identity.symbol, requested);
  const start = window.start ? Date.parse(window.start) : Number.NEGATIVE_INFINITY;
  const end = window.end ? Date.parse(window.end) : Number.POSITIVE_INFINITY;
  const points = series.points.filter((point) => {
    const timestamp = Date.parse(point.timestamp);
    return timestamp >= start && timestamp <= end;
  });
  const sliced = window.limit ? points.slice(-window.limit) : points;
  const first = sliced[0];
  return barSeriesSchema.parse({
    ...series,
    points: sliced,
    coverage: {
      ...series.coverage,
      actualStart: first?.timestamp ?? null,
      actualEnd: sliced.at(-1)?.timestamp ?? null,
      hasMoreBefore:
        series.coverage.hasMoreBefore ||
        Boolean(
          first &&
          series.points.some((point) => Date.parse(point.timestamp) < Date.parse(first.timestamp)),
        ),
    },
    inputFingerprint: barSeriesInputFingerprint(series.identity, sliced),
  });
};
