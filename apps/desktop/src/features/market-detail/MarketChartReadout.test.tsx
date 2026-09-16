import { renderToStaticMarkup } from 'react-dom/server';
import type { MarketChartBar } from './market-chart-types.js';
import { describe, expect, it } from 'vitest';
import { MarketChartReadout } from './MarketChartReadout.js';
import type { ChartPoint } from './market-chart-model.js';

const selectedBar = {
  timestamp: '2026-09-15T00:00:00.000Z',
  open: 100,
  high: 110,
  low: 98,
  close: 105,
  volume: 1200,
  completionStatus: 'complete',
  availableAt: '2026-08-21T00:00:00.000Z',
} as MarketChartBar;

const comparablePoint = {
  date: '2026-09-15',
  bar: selectedBar,
  indicators: {
    MA: { timestamp: selectedBar.timestamp, values: { ma5: 101, ma10: 99 } },
    MACD: {
      timestamp: selectedBar.timestamp,
      values: { dif: 1.2, dea: 0.8, histogram: 0.4 },
    },
    RSI: { timestamp: selectedBar.timestamp, values: { rsi12: 63 } },
  },
  comparableIndicators: { MA: true, MACD: true, RSI: true },
  comparable: true,
} as ChartPoint;

describe('MarketChartReadout', () => {
  it('全屏同时展开副图时显示所有实际渲染的辅助序列分组', () => {
    const html = renderToStaticMarkup(
      <MarketChartReadout
        selectedBar={selectedBar}
        selectedPoint={comparablePoint}
        selectedTimestamp={selectedBar.timestamp}
        lockedTimestamp={selectedBar.timestamp}
        visibleIndicators={['MA', 'MACD', 'RSI']}
        visibleMA={['ma5', 'ma10']}
        rsiPeriod={12}
        activePane="MACD"
        showBothPanes
      />,
    );

    expect(html).toContain('已锁定');
    expect(html).toContain('data-market-chart-readout-group="价格"');
    expect(html).toContain('data-market-chart-readout-group="均线"');
    expect(html).toContain('data-market-chart-readout-group="MACD"');
    expect(html).toContain('data-market-chart-readout-group="RSI"');
    expect(html).toContain('MA5');
    expect(html).toContain('DIF');
    expect(html).toContain('RSI12');
  });

  it('普通视图选择 MACD 时不显示未渲染的 RSI 读数', () => {
    const html = renderToStaticMarkup(
      <MarketChartReadout
        selectedBar={selectedBar}
        selectedPoint={comparablePoint}
        selectedTimestamp={selectedBar.timestamp}
        lockedTimestamp={null}
        visibleIndicators={['MA', 'MACD', 'RSI']}
        visibleMA={['ma5']}
        rsiPeriod={12}
        activePane="MACD"
        showBothPanes={false}
      />,
    );

    expect(html).toContain('data-market-chart-readout-group="MACD"');
    expect(html).not.toContain('data-market-chart-readout-group="RSI"');
  });

  it('普通视图选择 RSI 时不显示未渲染的 MACD 读数', () => {
    const html = renderToStaticMarkup(
      <MarketChartReadout
        selectedBar={selectedBar}
        selectedPoint={comparablePoint}
        selectedTimestamp={selectedBar.timestamp}
        lockedTimestamp={null}
        visibleIndicators={['MA', 'MACD', 'RSI']}
        visibleMA={['ma5']}
        rsiPeriod={12}
        activePane="RSI"
        showBothPanes={false}
      />,
    );

    expect(html).toContain('data-market-chart-readout-group="RSI"');
    expect(html).not.toContain('data-market-chart-readout-group="MACD"');
  });

  it('日期缺失或不可比时保留当前可见分组与标签槽位，并显示占位值', () => {
    const html = renderToStaticMarkup(
      <MarketChartReadout
        selectedBar={selectedBar}
        selectedPoint={undefined}
        selectedTimestamp={null}
        lockedTimestamp={null}
        visibleIndicators={['MA', 'MACD', 'RSI']}
        visibleMA={['ma5']}
        rsiPeriod={12}
        activePane="MACD"
        showBothPanes={false}
      />,
    );

    expect(html).toContain('data-market-chart-readout-group="价格"');
    expect(html).toContain('data-market-chart-readout-group="均线"');
    expect(html).toContain('data-market-chart-readout-group="MACD"');
    expect(html).not.toContain('data-market-chart-readout-group="RSI"');
    expect(html).toContain('data-market-chart-readout-slot="MA5"');
    expect(html).toContain('data-market-chart-readout-slot="DIF"');
    expect(html).toContain('>—</dd>');
    expect(html).toContain('min-h-14');
    expect(html).toContain('whitespace-nowrap');
  });
});
