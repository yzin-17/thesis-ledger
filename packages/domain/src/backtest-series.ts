import { DecimalValue } from './decimal.js';
import type { BacktestAssetType, BacktestMarket } from './backtest-contract.js';
import {
  isAvailableForDecisionAt,
  type BacktestAvailability,
} from './backtest-observation-clock.js';

export type BacktestSeriesStatus = 'available' | 'unavailable';

export interface BacktestSeriesPoint extends BacktestAvailability {
  /** 决策序列可重标时点；保留实际取值所属收盘，逐期保护禁止借用前一期。 */
  valueOccurredAt?: string;
  occurredAt: string;
  openedAt?: string;
  closedAt?: string;
  value?: string;
  status?: BacktestSeriesStatus;
  reason?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
}

export interface BacktestSeries {
  /** 历史与窗口节点必须保留最近观测的不可用状态，禁止借用更早的有效值。 */
  strictObservations?: boolean;
  sourceId: string;
  symbol: string;
  market: BacktestMarket;
  assetType: BacktestAssetType;
  field: 'open' | 'high' | 'low' | 'close' | 'volume' | 'nav';
  timeframe: '1d' | '60m' | '30m' | '15m' | '5m' | '1m';
  adjusted: boolean;
  points: readonly BacktestSeriesPoint[];
}

interface CorporateActionForSeriesBase {
  symbol: string;
  market: BacktestMarket;
  assetType: BacktestAssetType;
  occurredAt: string;
  availableAt: string;
}

export type CorporateActionForSeries = CorporateActionForSeriesBase &
  (
    | { type: 'CASH_DIVIDEND'; cashAmount: string; ratio?: never }
    | { type: 'SPLIT' | 'REVERSE_SPLIT'; ratio: string; cashAmount?: never }
  );

export interface SeriesVariants {
  raw: BacktestSeries;
  adjusted: BacktestSeries;
}

const time = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`无效时间: ${value}`);
  return parsed;
};

const comparePoints = (left: BacktestSeriesPoint, right: BacktestSeriesPoint) => {
  const occurred = time(left.occurredAt) - time(right.occurredAt);
  if (occurred !== 0) return occurred;
  return time(left.availableAt) - time(right.availableAt);
};

const copyPoint = (point: BacktestSeriesPoint, value: string): BacktestSeriesPoint => {
  const rest = { ...point };
  delete rest.reason;
  return { ...rest, value, status: 'available' };
};

const actionFactor = (
  point: BacktestSeriesPoint,
  action: CorporateActionForSeries,
  points: readonly BacktestSeriesPoint[],
  cashDividendReferencePoints: readonly BacktestSeriesPoint[],
) => {
  if (time(action.occurredAt) <= time(point.occurredAt)) return DecimalValue.from('1');
  if (action.type === 'SPLIT' || action.type === 'REVERSE_SPLIT') {
    return DecimalValue.from('1').dividedBy(action.ratio, 20);
  }
  const cashAmount = action.cashAmount;
  if (cashAmount === undefined) throw new Error('现金分红缺少 cashAmount');
  const previous = [...cashDividendReferencePoints]
    .filter(
      (candidate) =>
        candidate.value !== undefined && time(candidate.occurredAt) < time(action.occurredAt),
    )
    .sort(comparePoints)
    .at(-1);
  if (!previous?.value) return DecimalValue.from('1');
  const close = DecimalValue.from(previous.value);
  if (close.isZero()) throw new Error('公司行动前价格不能为零');
  return close.minus(cashAmount).dividedBy(close, 20);
};

/**
 * Create raw and point-in-time adjusted views. An action only changes a point
 * when it has occurred after that point and was already available at it; this
 * prevents a later corporate-action revision from becoming a future leak.
 */
export const buildSeriesVariantsAt = (
  series: Omit<BacktestSeries, 'adjusted'> & { adjusted?: boolean },
  actions: readonly CorporateActionForSeries[],
  evaluationAt: string,
  options: { cashDividendReferencePoints?: readonly BacktestSeriesPoint[] } = {},
): SeriesVariants => {
  const evaluationTime = time(evaluationAt);
  const raw: BacktestSeries = {
    ...series,
    adjusted: false,
    points: [...series.points].sort(comparePoints).map((point) => {
      if (isAvailableForDecisionAt(point, evaluationAt)) return point;
      const rest = { ...point };
      delete rest.value;
      return {
        ...rest,
        status: 'unavailable' as const,
        reason: '数据尚未 availableAt <= evaluationAt',
      };
    }),
  };
  const knownActions = actions.filter(
    (action) =>
      time(action.availableAt) <= evaluationTime && time(action.occurredAt) <= evaluationTime,
  );
  const adjustedPoints = raw.points.map((point) => {
    if (point.value === undefined || point.status === 'unavailable') return point;
    const applicable = knownActions.filter(
      (action) =>
        action.symbol === series.symbol &&
        action.market === series.market &&
        action.assetType === series.assetType,
    );
    const factor = applicable.reduce(
      (current, action) =>
        current.times(
          actionFactor(
            point,
            action,
            raw.points,
            options.cashDividendReferencePoints ?? raw.points,
          ),
        ),
      DecimalValue.from('1'),
    );
    return copyPoint(point, DecimalValue.from(point.value).times(factor).toString());
  });
  return {
    raw,
    adjusted: { ...raw, adjusted: true, points: adjustedPoints },
  };
};

export const buildSeriesVariants = (
  series: Omit<BacktestSeries, 'adjusted'> & { adjusted?: boolean },
  actions: readonly CorporateActionForSeries[],
  evaluationAt: string,
) => buildSeriesVariantsAt(series, actions, evaluationAt);

export const applyCorporateActions = buildSeriesVariantsAt;

export interface AlignedSeriesPoint {
  evaluationAt: string;
  point?: BacktestSeriesPoint;
  status: BacktestSeriesStatus;
  reason?: string;
}

/** Align by absolute instants, never by array index or local-market date. */
const immutableTimelines = new WeakMap<
  readonly BacktestSeriesPoint[],
  readonly BacktestSeriesPoint[]
>();
const orderedPoints = (input: readonly BacktestSeriesPoint[]) => {
  const cached = immutableTimelines.get(input);
  if (cached) return cached;
  const ordered = [...input].sort(comparePoints);
  // 可变调用方仍逐次读取；仅缓存冻结容器和冻结记录，避免排序身份过期。
  if (Object.isFrozen(input) && input.every(Object.isFrozen))
    immutableTimelines.set(input, ordered);
  return ordered;
};

export const alignSeriesAt = (
  series: BacktestSeries,
  evaluationTimes: readonly string[],
): AlignedSeriesPoint[] => {
  const points = orderedPoints(series.points);
  return evaluationTimes.map((evaluationAt) => {
    const at = time(evaluationAt);
    let low = 0,
      high = points.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (time(points[middle]!.occurredAt) <= at) low = middle + 1;
      else high = middle;
    }
    let candidate: BacktestSeriesPoint | undefined;
    for (let index = low - 1; index >= 0; index--) {
      const point = points[index]!;
      if (
        point.status !== 'unavailable' &&
        point.value !== undefined &&
        isAvailableForDecisionAt(point, evaluationAt)
      ) {
        candidate = point;
        break;
      }
    }
    return candidate
      ? { evaluationAt, point: candidate, status: 'available' as const }
      : {
          evaluationAt,
          status: 'unavailable' as const,
          reason: '没有 availableAt <= evaluationAt 的最新值',
        };
  });
};

export interface WarmupResult {
  requiredLookback: number;
  warmupPoints: readonly BacktestSeriesPoint[];
  outputPoints: readonly BacktestSeriesPoint[];
  status: BacktestSeriesStatus;
  reason?: string;
}

export const splitWarmup = (
  points: readonly BacktestSeriesPoint[],
  startDate: string,
  requiredLookback: number,
): WarmupResult => {
  const ordered = [...points].sort(comparePoints);
  const start = time(startDate);
  const warmupPoints = ordered.filter((point) => time(point.occurredAt) < start);
  const outputPoints = ordered.filter((point) => time(point.occurredAt) >= start);
  const warmupRequired = Math.max(0, requiredLookback - 1);
  const usableWarmupPoints = warmupRequired === 0 ? [] : warmupPoints.slice(-warmupRequired);
  const hasUnavailableWarmup = usableWarmupPoints.some(
    (point) => point.status === 'unavailable' || point.value === undefined,
  );
  const status =
    usableWarmupPoints.length >= warmupRequired && !hasUnavailableWarmup
      ? 'available'
      : 'unavailable';
  return {
    requiredLookback,
    warmupPoints,
    outputPoints,
    status,
    ...(status === 'unavailable'
      ? { reason: `warmup 不足或不连续：需要 ${requiredLookback - 1} 个 startDate 前可用值` }
      : {}),
  };
};

export const latestAvailablePoint = (
  series: BacktestSeries,
  evaluationAt: string,
): BacktestSeriesPoint | undefined => alignSeriesAt(series, [evaluationAt])[0]?.point;
