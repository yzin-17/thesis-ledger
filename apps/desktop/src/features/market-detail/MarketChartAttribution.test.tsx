import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarketChartAttribution } from './MarketChartAttribution.js';
import { navChartLayoutOptions } from './MarketNavChart.js';
import { marketChartLayoutOptions } from './MarketPriceLightweightChart.js';

describe('MarketChartAttribution', () => {
  it('关闭两类图表的内置图标，并提供可访问的文字来源链接', () => {
    const html = renderToStaticMarkup(<MarketChartAttribution />);

    expect(marketChartLayoutOptions.attributionLogo).toBe(false);
    expect(navChartLayoutOptions.attributionLogo).toBe(false);
    expect(html).toContain('TradingView Lightweight Charts™');
    expect(html).toContain('href="https://www.tradingview.com/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
