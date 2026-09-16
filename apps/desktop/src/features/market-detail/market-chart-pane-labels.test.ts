import { describe, expect, it } from 'vitest';
import { marketChartPaneLabels } from './market-chart-pane-labels.js';

describe('marketChartPaneLabels', () => {
  it('随主图模式标注价格 pane，并保留成交量 pane', () => {
    expect(
      marketChartPaneLabels({
        chartMode: 'candles',
        activePane: 'MACD',
        showBothPanes: false,
        hasMacdPane: false,
        hasRsiPane: false,
      }),
    ).toEqual([
      { pane: 0, text: '价格 · K线' },
      { pane: 1, text: '成交量' },
    ]);
    expect(
      marketChartPaneLabels({
        chartMode: 'close',
        activePane: 'MACD',
        showBothPanes: false,
        hasMacdPane: false,
        hasRsiPane: false,
      })[0],
    ).toEqual({ pane: 0, text: '价格 · 收盘线' });
  });

  it('普通模式只标注当前有 points 的副图', () => {
    expect(
      marketChartPaneLabels({
        chartMode: 'candles',
        activePane: 'MACD',
        showBothPanes: false,
        hasMacdPane: true,
        hasRsiPane: true,
      }).at(-1),
    ).toEqual({ pane: 2, text: 'MACD' });
    expect(
      marketChartPaneLabels({
        chartMode: 'candles',
        activePane: 'RSI',
        showBothPanes: false,
        hasMacdPane: true,
        hasRsiPane: true,
      }).at(-1),
    ).toEqual({ pane: 2, text: 'RSI' });
  });

  it('全屏按实际 pane 顺序标注 MACD 和 RSI，并省略无 points 的 pane', () => {
    expect(
      marketChartPaneLabels({
        chartMode: 'candles',
        activePane: 'MACD',
        showBothPanes: true,
        hasMacdPane: true,
        hasRsiPane: true,
      }),
    ).toEqual([
      { pane: 0, text: '价格 · K线' },
      { pane: 1, text: '成交量' },
      { pane: 2, text: 'MACD' },
      { pane: 3, text: 'RSI' },
    ]);
    expect(
      marketChartPaneLabels({
        chartMode: 'candles',
        activePane: 'RSI',
        showBothPanes: true,
        hasMacdPane: false,
        hasRsiPane: true,
      }),
    ).toEqual([
      { pane: 0, text: '价格 · K线' },
      { pane: 1, text: '成交量' },
      { pane: 2, text: 'RSI' },
    ]);
  });
});
