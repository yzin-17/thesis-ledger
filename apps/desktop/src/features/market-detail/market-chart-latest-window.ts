import type { ChartPoint } from './market-chart-model.js';

/**
 * 右边界增量窗口以「图表已加载的最新交易日」为断点，并向左重叠一天再取。
 * 重叠那天是探针：只有窗口里出现更晚的日期，才说明服务端真的产出了更新数据，
 * 探针本身不算更新，因此不能直接拿窗口最新日期与断点比较。
 */
export const barDatesAfter = (
  points: readonly { timestamp: string }[],
  baseline: string,
): string[] =>
  [
    ...new Set(
      points
        .map((point) => point.timestamp.slice(0, 10))
        .filter((date) => date > baseline),
    ),
  ].sort();

/** 每次打开详情只允许首个无历史分页查询承担显式最新检查。 */
export const shouldRefreshOpeningQuery = (
  symbol: string,
  historyEnd: string | undefined,
  checkedSymbol: string | null,
) => historyEnd === undefined && checkedSymbol !== symbol;

const pointSnapshot = (point: ChartPoint | undefined) => {
  if (!point) return null;
  return {
    bar: point.bar
      ? {
          open: point.bar.open,
          high: point.bar.high,
          low: point.bar.low,
          close: point.bar.close,
          volume: point.bar.volume,
          amount: point.bar.amount,
          completionStatus: point.bar.completionStatus,
          availableAt: point.bar.availableAt,
          inputFingerprint: point.bar.inputFingerprint,
        }
      : null,
    indicators: Object.fromEntries(
      Object.entries(point.indicators).map(([name, indicator]) => [
        name,
        indicator
          ? {
              values: indicator.values,
              inputFingerprint: indicator.inputFingerprint,
            }
          : null,
      ]),
    ),
  };
};

/**
 * 右边界探针不只关注是否出现新日期；同一交易日的盘中 OHLC、成交量、指标或完成状态
 * 变化也必须提交。比较使用显示点的语义字段，忽略响应请求 ID 和服务时间等元数据。
 */
export const hasLatestPointChanges = (
  current: readonly ChartPoint[],
  next: readonly ChartPoint[],
  baseline: string,
) => {
  const currentByDate = new Map(current.map((point) => [point.date, point]));
  return next
    .filter((point) => point.date >= baseline)
    .some(
      (point) =>
        JSON.stringify(pointSnapshot(currentByDate.get(point.date))) !==
        JSON.stringify(pointSnapshot(point)),
    );
};
