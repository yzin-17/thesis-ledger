import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { QuoteSection, FundNavSection } from '../src/features/market-detail/MarketDetailSections';
import { MarketNavChartReadout } from '../src/features/market-detail/MarketNavChartReadout';
import { MarketChartReadout } from '../src/features/market-detail/MarketChartReadout';
import { MarketPriceChart } from '../src/features/market-detail/MarketDetailCharts';
import { FundIntradayChart } from '../src/features/market-detail/FundIntradayChart';
import { MarketTradingOverlayControls } from '../src/features/market-detail/MarketTradingOverlayControls';
import { marketNumberSamples, marketNumberSample } from './market-number-samples';
const retry = () => {
  throw new Error('只读测试不请求');
};
function withCache(
  name: string,
  render: (values: ReturnType<typeof marketNumberSample>) => ReactNode,
) {
  const values = marketNumberSample(name),
    client = new QueryClient({
      defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } },
    });
  client.setQueryData(['market', 'fund-valuation', values.symbol], values.valuation);
  client.setQueryData(['market', 'fund-valuation-today', values.symbol, values.day], values.today);
  const before = structuredClone({ valuation: values.valuation, today: values.today });
  try {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>{render(values)}</QueryClientProvider>,
    );
    expect({ valuation: values.valuation, today: values.today }).toEqual(before);
    return html;
  } finally {
    client.clear();
  }
}
describe.each(marketNumberSamples)(
  '$name：行情数字事实',
  ({ name, value, compact, valuation, measurement, quote }) => {
    it('报价保留币种及二到二十位合同', () => {
      const data = marketNumberSample(name),
        before = structuredClone(data.quote);
      const html = renderToStaticMarkup(
        <QuoteSection
          section={{
            capability: 'quote',
            status: data.quote ? 'ready' : 'empty',
            ...(data.quote && { data: data.quote }),
          }}
          onRetry={retry}
          retrying={false}
        />,
      );
      if (data.quote) expect(html).toContain(quote);
      else expect(html).toContain('当前没有可用实时行情');
      expect(data.quote).toEqual(before);
    });
    it('正式净值与盘中估值保留各自精度', () => {
      const html = withCache(name, (data) => (
        <FundNavSection
          section={{
            capability: 'fund-nav',
            status: data.nav ? 'ready' : 'empty',
            ...(data.nav && { data: data.nav }),
          }}
          onRetry={retry}
          retrying={false}
        />
      ));
      if (value !== null) {
        expect(html).toContain(compact);
        if (value > 0) expect(html).toContain(valuation);
        expect(html).toContain('净值日期');
      } else expect(html).toContain('当前没有可用基金净值');
    });
    it('历史净值读数保持非零与日期', () => {
      const { nav } = marketNumberSample(name);
      const html = renderToStaticMarkup(
        <MarketNavChartReadout
          selected={nav}
          selectedDate={null}
          locked={false}
          viewportChange={null}
        />,
      );
      expect(html).toContain('单位净值 ' + compact);
    });
    it('盘中图表读数保留固定四位或科学计数', () => {
      const html = withCache(name, (data) => (
        <FundIntradayChart symbol={data.symbol} onHistory={retry} />
      ));
      expect(html).toContain('盘中估值 ' + (value !== null && value > 0 ? valuation : '—'));
    });
    it('价格、成交量和指标读数不把非零显示为零', () => {
      const { bars, point } = marketNumberSample(name),
        before = structuredClone({ bars, point });
      const html = renderToStaticMarkup(
        <MarketChartReadout
          selectedBar={bars.at(-1)}
          selectedPoint={point}
          selectedTimestamp={null}
          lockedTimestamp={null}
          visibleIndicators={['MA', 'MACD', 'RSI']}
          visibleMA={['ma5']}
          rsiPeriod={12}
          activePane="MACD"
          showBothPanes
        />,
      );
      expect(html).toContain(compact);
      if (value !== null && value > 0) expect(html).toContain('-' + compact);
      expect({ bars, point }).toEqual(before);
    });
    it('区间测量保留六位与负差值', () => {
      const { overlay } = marketNumberSample(name),
        before = structuredClone(overlay.measurement);
      const html = renderToStaticMarkup(<MarketTradingOverlayControls overlay={overlay} />);
      if (value !== null) {
        expect(html).toContain('价格区间：' + measurement);
        if (value > 0) expect(html).toContain('-' + measurement);
      } else expect(html).not.toContain('价格区间测量结果');
      expect(overlay.measurement).toEqual(before);
    });
  },
);
it('股票图表没有报价时最新行情保持未知', () => {
  const html = renderToStaticMarkup(<MarketPriceChart bars={[]} />);
  expect(html).toContain('最新行情 —');
  expect(html).not.toContain('最新行情 0');
});
