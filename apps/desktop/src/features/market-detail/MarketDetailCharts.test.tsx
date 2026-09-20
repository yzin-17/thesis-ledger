import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarketPriceChart } from './MarketDetailCharts.js';
import type { MarketChartBar } from './market-chart-types.js';

const bar: MarketChartBar = {
  timestamp: '2026-09-15T00:00:00.000Z',
  open: 4.541,
  high: 4.568,
  low: 4.515,
  close: 4.523,
  volume: 69_734_100,
  amount: 315_000_000,
  completionStatus: 'complete',
  availableAt: '2026-09-15T07:00:00.000Z',
};

describe('MarketPriceChart 右边界增量反馈', () => {
  it('没有更新数据时只提示，不显示告警', () => {
    const html = renderToStaticMarkup(
      <MarketPriceChart bars={[bar]} latestNotice="已是最新日线。" />,
    );
    expect(html).toContain('data-market-latest-notice');
    expect(html).toContain('已是最新日线。');
    expect(html).not.toContain('data-market-latest-error');
  });

  it('补充到更新日线时提示条数，并保留图表', () => {
    const html = renderToStaticMarkup(
      <MarketPriceChart bars={[bar]} latestNotice="已补充 2 根更新日线。" />,
    );
    expect(html).toContain('已补充 2 根更新日线。');
    expect(html).toContain('data-market-lightweight-chart="true"');
  });

  it('探测失败时保留图表并提供重试入口', () => {
    const html = renderToStaticMarkup(
      <MarketPriceChart
        bars={[bar]}
        latestError="检查更新日线失败，当前图表已保留。"
        onRetryLater={() => undefined}
      />,
    );
    expect(html).toContain('data-market-latest-error');
    expect(html).toContain('检查更新日线失败，当前图表已保留。');
    expect(html).toContain('重试');
    expect(html).toContain('data-market-lightweight-chart="true"');
  });

  it('未收盘日线保留快照并明确标注完成状态', () => {
    const html = renderToStaticMarkup(
      <MarketPriceChart bars={[{ ...bar, completionStatus: 'incomplete' }]} />,
    );
    expect(html).toContain('当日未完成');
  });
});
