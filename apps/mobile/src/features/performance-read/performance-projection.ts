import { normalizeAllocationCategory, normalizeAllocationTargets } from '@thesis-ledger/domain';
import type {
  PerformanceLayersWire,
  PerformanceSeriesWire,
  PerformanceTargetsWire,
} from '@thesis-ledger/schemas';
import type { ChartData } from '../../platform/charts/chart-document';
export const allocationLabels = {
  stock: '股票',
  etf: 'ETF',
  fund: '基金',
  index: '指数',
  cash: '现金',
};
export function performanceChartData(series: PerformanceSeriesWire): ChartData {
  return {
    main: 'line',
    lines: [],
    candles: series.points.map((point) => ({
      time: Math.floor(Date.parse(point.at) / 1000),
      open: point.value,
      high: point.value,
      low: point.value,
      close: point.value,
    })),
  };
}
export function performanceAllocationInput(
  layers: PerformanceLayersWire,
  targets: PerformanceTargetsWire,
  accountId?: string,
) {
  const total = accountId
    ? layers.account.find((row) => row.accountId === accountId)
    : layers.portfolio;
  if (!total) return null;
  const normalized = normalizeAllocationTargets(targets.targets);
  const missing = new Set([
    ...layers.dataQuality.missingSymbols,
    ...total.missingSymbols,
    ...normalized.unknown.map((name) => `配置类别:${name}`),
  ]);
  const positions: Array<{ category: string; marketValue: number }> = [];
  for (const row of layers.security) {
    if (accountId && row.accountId !== accountId) continue;
    const category = normalizeAllocationCategory(row.assetType);
    if (!category || category === 'cash') {
      missing.add(row.symbol);
      continue;
    }
    if (row.marketValue === null) {
      missing.add(row.symbol);
      continue;
    }
    positions.push({ category, marketValue: row.marketValue });
  }
  if (total.cashValue !== 0 || normalized.targets.cash !== undefined)
    positions.push({ category: 'cash', marketValue: total.cashValue });
  return {
    positions,
    ...(Object.keys(normalized.targets).length ? { targets: normalized.targets } : {}),
    dataQuality: {
      partial: layers.dataQuality.partial || total.partial || missing.size > 0,
      missingSymbols: [...missing],
    },
  };
}
export function displayRatio(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(2)}%`;
}
