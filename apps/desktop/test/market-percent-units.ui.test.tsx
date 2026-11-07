import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { QuoteSection, ChipSection } from '../src/features/market-detail/MarketDetailSections';
import { MarketNavChartReadout } from '../src/features/market-detail/MarketNavChartReadout';
import { MarketPriceChart } from '../src/features/market-detail/MarketDetailCharts';
import { FundCurrentValuation } from '../src/features/market-detail/FundCurrentValuation';
import { FundIntradayChart } from '../src/features/market-detail/FundIntradayChart';
import { marketPercentSamples, marketPercentSample } from './market-percent-unit-samples';
const retry = () => {
  throw new Error('只读渲染不应重试');
};
describe.each(marketPercentSamples)('$name：实际行情百分比读数', ({ name }) => {
  it('报价保持符号、未知值及输入', () => {
    const { quote, sample } = marketPercentSample(name),
      before = structuredClone(quote);
    const html = renderToStaticMarkup(
      <QuoteSection
        section={{ capability: 'quote', status: 'ready', data: quote }}
        onRetry={retry}
        retrying={false}
      />,
    );
    expect(html).toContain(sample.quoteLabel);
    expect(quote).toEqual(before);
  });
  it('筹码获利和集中比例保留非零', () => {
    const { chip, sample } = marketPercentSample(name),
      before = structuredClone(chip);
    const html = renderToStaticMarkup(
      <ChipSection
        section={{
          capability: 'chip',
          status: chip ? 'ready' : 'empty',
          ...(chip && { data: chip }),
        }}
        onRetry={retry}
        retrying={false}
      />,
    );
    if (sample.chipLabel) expect(html.split(sample.chipLabel)).toHaveLength(3);
    else expect(html).toContain('当前没有可用筹码摘要');
    expect(chip).toEqual(before);
  });
  it('净值读数按比例展示并保留日期/锁定语义', () => {
    const { history, sample } = marketPercentSample(name);
    const html = renderToStaticMarkup(
      <MarketNavChartReadout
        selectedDate="2026-11-07"
        selected={history.at(-1)}
        locked
        viewportChange={sample.ratio}
      />,
    );
    expect(html).toContain('可视区间涨跌幅 ' + sample.ratioLabel);
    expect(html).toContain('已锁定 2026-11-07');
  });
  it('股票图表的区间说明不乘法溢出或归零', () => {
    const { bars, sample } = marketPercentSample(name),
      before = structuredClone(bars);
    const html = renderToStaticMarkup(<MarketPriceChart bars={bars} />);
    if (sample.ratio === null) expect(html).not.toContain('可视区间');
    else expect(html).toContain('可视区间 ' + sample.ratioLabel);
    expect(bars).toEqual(before);
  });
  it.each(['current', 'intraday'] as const)('%s 消费已为百分数值并保留缓存', (kind) => {
    const { valuation, today, sample, symbol, day } = marketPercentSample(name);
    const client = new QueryClient({
      defaultOptions: { queries: { enabled: false, staleTime: Infinity, retry: false } },
    });
    client.setQueryData(['market', 'fund-valuation', symbol], valuation);
    client.setQueryData(['market', 'fund-valuation-today', symbol, day], today);
    const before = structuredClone({ valuation, today });
    try {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={client}>
          {kind === 'current' ? (
            <FundCurrentValuation symbol={symbol} />
          ) : (
            <FundIntradayChart symbol={symbol} onHistory={retry} />
          )}
        </QueryClientProvider>,
      );
      if (sample.percentLabel) expect(html).toContain(sample.percentLabel);
      else expect(html).not.toMatch(/NaN|Infinity|[+-]0.00%/);
      expect(html).toContain(
        kind === 'current' ? '已休市' : sample.percent === null ? '估值不可用' : '部分覆盖',
      );
      expect({ valuation, today }).toEqual(before);
    } finally {
      client.clear();
    }
  });
});
it('最大有限比例在净值读数中不先溢出', () => {
  const html = renderToStaticMarkup(
    <MarketNavChartReadout
      selectedDate={null}
      selected={undefined}
      locked={false}
      viewportChange={Number.MAX_VALUE}
    />,
  );
  expect(html).toContain('+1.797693E310%');
});
