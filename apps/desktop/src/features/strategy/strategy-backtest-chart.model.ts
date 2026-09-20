import type { BacktestJob, BacktestJobResult } from './strategy.types.js';
import { backtestBaseCurrency, backtestNumber } from './strategy-backtest-detail.model.js';

export type BacktestEquityChartPoint = {
  time: number;
  timestamp: string;
  value: number;
  cash: number | null;
  positionsValue: number | null;
};

export type BacktestDrawdownChartPoint = {
  time: number;
  timestamp: string;
  value: number;
};

export type BacktestChartModel = {
  equity: BacktestEquityChartPoint[];
  drawdown: BacktestDrawdownChartPoint[];
  drawdownSource: 'authoritative' | 'display-derived' | 'unavailable';
  currency: 'CNY' | 'HKD' | 'USD' | null;
  timezone: string;
  completeness: 'complete' | 'limited' | 'unknown';
  limitation: string | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const timestampValue = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? { time, timestamp: value } : null;
};

const normalizeTimezone = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    new Intl.DateTimeFormat('zh-CN', { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    return null;
  }
};

export const backtestChartTimezone = (job: BacktestJob) => {
  const input = asRecord(job.input);
  const runConfig = asRecord(input?.runConfig);
  const executionModel = asRecord(runConfig?.executionModel ?? input?.executionModel);
  const scope = asRecord(executionModel?.scope);
  const disclosure = asRecord(job.executionModelDisclosure);
  const disclosureModel = asRecord(disclosure?.model);
  const disclosureScope = asRecord(disclosureModel?.scope);
  return normalizeTimezone(scope?.timezone ?? disclosureScope?.timezone) ?? 'UTC';
};

const sortedUnique = <Point extends { time: number }>(points: Point[]) => {
  const byTime = new Map<number, Point>();
  for (const point of points) byTime.set(point.time, point);
  return [...byTime.values()].sort((left, right) => left.time - right.time);
};

export const parseBacktestEquityPoints = (result: BacktestJobResult) => {
  if (!Array.isArray(result.equityCurve)) return [];
  return sortedUnique(
    result.equityCurve.flatMap((raw) => {
      const point = asRecord(raw);
      const timestamp = timestampValue(point?.occurredAt ?? point?.date);
      const value = backtestNumber(point?.value);
      if (!timestamp || value === null) return [];
      return [
        {
          ...timestamp,
          value,
          cash: backtestNumber(point?.cash ?? point?.cashValue),
          positionsValue: backtestNumber(point?.positionsValue ?? point?.marketValue),
        },
      ];
    }),
  );
};

export const parseBacktestDrawdownPoints = (result: BacktestJobResult) => {
  const rawCurve = Array.isArray(result.drawdownCurve) ? result.drawdownCurve : [];
  return sortedUnique(
    rawCurve.flatMap((raw) => {
      const point = asRecord(raw);
      const timestamp = timestampValue(point?.occurredAt ?? point?.date);
      const value = backtestNumber(point?.drawdown ?? point?.value);
      return timestamp && value !== null ? [{ ...timestamp, value }] : [];
    }),
  );
};

export const deriveDisplayDrawdown = (equity: BacktestEquityChartPoint[]) => {
  let peak: number | null = null;
  return equity.map((point) => {
    peak = peak === null ? point.value : Math.max(peak, point.value);
    const value = peak === 0 ? 0 : point.value / peak - 1;
    return { time: point.time, timestamp: point.timestamp, value };
  });
};

const resultCompleteness = (result: BacktestJobResult) => {
  const value = asRecord(result)?.completeness;
  if (value === 'complete') return 'complete' as const;
  if (value === 'partial' || value === 'unavailable') return 'limited' as const;
  const record = asRecord(value);
  if (record?.status === 'complete') return 'complete' as const;
  if (record) return 'limited' as const;
  return 'unknown' as const;
};

export const buildBacktestChartModel = (
  job: BacktestJob,
  result: BacktestJobResult,
): BacktestChartModel => {
  const equity = parseBacktestEquityPoints(result);
  const authoritative = parseBacktestDrawdownPoints(result);
  let drawdown = authoritative;
  let drawdownSource: BacktestChartModel['drawdownSource'] = 'authoritative';
  if (authoritative.length === 0 && equity.length > 0) {
    drawdown = deriveDisplayDrawdown(equity);
    drawdownSource = 'display-derived';
  } else if (authoritative.length === 0) {
    drawdownSource = 'unavailable';
  }
  const completeness = resultCompleteness(result);
  let limitation: string | null = null;
  if (completeness === 'limited') {
    limitation = '结果记录为不完整；缺口位置未记录，图中仅连接已返回时点。';
  } else if (completeness === 'unknown') {
    limitation = '结果未提供完整性证据；图中仅展示已返回时点。';
  }
  return {
    equity,
    drawdown,
    drawdownSource,
    currency: backtestBaseCurrency(job, result),
    timezone: backtestChartTimezone(job),
    completeness,
    limitation,
  };
};

export const visibleBacktestPoints = <Point extends { time: number }>(
  points: Point[],
  range: { from: number; to: number } | null,
) => {
  if (!range) return points;
  return points.filter((point) => point.time >= range.from && point.time <= range.to);
};

export const nextBacktestLogicalRange = (
  range: { from: number; to: number },
  pointCount: number,
  action: 'zoomIn' | 'zoomOut' | 'earlier' | 'later',
) => {
  if (pointCount < 2) return range;
  const maxIndex = pointCount - 1;
  const width = Math.max(range.to - range.from, 1);
  if (action === 'zoomIn' || action === 'zoomOut') {
    const factor = action === 'zoomIn' ? 0.75 : 1.35;
    const nextWidth = Math.max(1, Math.min(maxIndex, width * factor));
    const center = (range.from + range.to) / 2;
    let from = Math.max(0, center - nextWidth / 2);
    let to = Math.min(maxIndex, from + nextWidth);
    from = Math.max(0, to - nextWidth);
    to = Math.min(maxIndex, from + nextWidth);
    return { from, to };
  }
  const shift = width * 0.25 * (action === 'earlier' ? -1 : 1);
  const from = Math.max(0, Math.min(maxIndex - width, range.from + shift));
  return { from, to: from + width };
};

export const backtestRangePresets = (points: BacktestEquityChartPoint[]) => {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return [];
  const duration = last.time - first.time;
  const day = 86_400_000;
  return [
    ...(duration >= 30 * day ? [{ label: '近 1 月', days: 30 }] : []),
    ...(duration >= 90 * day ? [{ label: '近 3 月', days: 90 }] : []),
    ...(duration >= 365 * day ? [{ label: '近 1 年', days: 365 }] : []),
    { label: '全部', days: null },
  ];
};

const csvCell = (value: string | number | null) => {
  const text = value === null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const backtestEquityCsv = (
  model: BacktestChartModel,
  range: { from: number; to: number } | null,
) => {
  const points = visibleBacktestPoints(model.equity, range);
  const rows = [
    [
      `时间（${model.timezone}）`,
      `组合权益（${model.currency ?? '币种未记录'}）`,
      '现金',
      '持仓市值',
    ],
    ...points.map((point) => [point.timestamp, point.value, point.cash, point.positionsValue]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`;
};
