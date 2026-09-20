/**
 * Lightweight Charts reports a negative `barsBefore` when the visible logical
 * range extends into space before the first loaded bar.  Keep that versioned
 * chart-library detail at the market-chart boundary instead of teaching the
 * UI about logical indexes.
 */
export const hasLeftHistoryBlank = (barsBefore: number | null | undefined) =>
  typeof barsBefore === 'number' && barsBefore < 0;

/**
 * 右侧与左侧不对称：`barsAfter` 为 0 表示视口右端正好停在已加载的最后一根
 * 日线上，为负数才是越过了右端。服务端不声明「还有更晚的数据」，因此把
 * 「已经贴到最后一根」也算作看到最新——是否真的存在更新由请求结果判断。
 */
export const hasReachedLatestBoundary = (barsAfter: number | null | undefined) =>
  typeof barsAfter === 'number' && barsAfter <= 0;
