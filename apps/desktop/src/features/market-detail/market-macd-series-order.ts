type OrderedSeries = { setSeriesOrder: (order: number) => void };

export function applyMacdSeriesOrder(series: ReadonlyMap<string, OrderedSeries>) {
  // MACD 固定在 2 号副图；从后到前依次为零轴、柱体、DIF、DEA。
  ['MACD-2-zero', 'MACD-2-2', 'MACD-2-0', 'MACD-2-1'].forEach((key, index) => {
    series.get(key)?.setSeriesOrder(index);
  });
}
