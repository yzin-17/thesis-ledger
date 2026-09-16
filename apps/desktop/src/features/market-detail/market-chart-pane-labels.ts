import type { ChartPreference } from './market-chart-preferences.js';

export type MarketChartPaneLabel = {
  pane: number;
  text: string;
};

export const marketChartPaneLabels = ({
  chartMode,
  activePane,
  showBothPanes,
  hasMacdPane,
  hasRsiPane,
}: {
  chartMode: ChartPreference['chartMode'];
  activePane: ChartPreference['activePane'];
  showBothPanes: boolean;
  hasMacdPane: boolean;
  hasRsiPane: boolean;
}): MarketChartPaneLabel[] => {
  const labels: MarketChartPaneLabel[] = [
    { pane: 0, text: chartMode === 'candles' ? '价格 · K线' : '价格 · 收盘线' },
    { pane: 1, text: '成交量' },
  ];
  if (showBothPanes) {
    if (hasMacdPane) labels.push({ pane: 2, text: 'MACD' });
    if (hasRsiPane) labels.push({ pane: hasMacdPane ? 3 : 2, text: 'RSI' });
    return labels;
  }
  if (activePane === 'MACD' && hasMacdPane) labels.push({ pane: 2, text: 'MACD' });
  if (activePane === 'RSI' && hasRsiPane) labels.push({ pane: 2, text: 'RSI' });
  return labels;
};
