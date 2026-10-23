import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { quoteSchema } from '@thesis-ledger/schemas';
import { QuoteSection } from './MarketDetailSections.js';

vi.mock('./MarketDetailCharts.js', () => ({
  FundNavHistoryChart: () => null,
  MarketPriceChart: () => null,
}));

const renderQuote = (price: number, currency?: 'CNY' | 'HKD' | 'USD') => {
  const time = '2026-10-16T00:00:00.000Z';
  const quote = quoteSchema.parse({
    version: 3,
    symbol: '00700.HK',
    open: price,
    high: price,
    low: price,
    price,
    previousClose: price,
    volume: 100,
    amount: price * 100,
    stale: false,
    ...(currency ? {
      units: { priceCurrency: currency, volume: 'share', turnoverCurrency: 'unknown' },
    } : {}),
    provider: 'fixture',
    fetchedAt: time,
    marketTime: time,
    freshness: 'delayed',
  });
  return renderToStaticMarkup(
    <QuoteSection
      section={{ capability: 'quote', status: 'ready', data: quote }}
      onRetry={vi.fn()}
      retrying={false}
    />,
  );
};

describe('行情金额的币种与精度', () => {
  it.each([
    ['CNY', '¥500.125'],
    ['HKD', 'HK$500.125'],
    ['USD', 'US$500.125'],
  ] as const)('按响应 %s 显示实时价和前收价', (currency, expected) => {
    expect(renderQuote(500.125, currency).split(expected)).toHaveLength(3);
  });

  it('保留 ETF 的千分位报价', () => {
    expect(renderQuote(4.236, 'CNY')).toContain('¥4.236');
  });

  it('小额报价保持有效小数，不显示成零', () => {
    expect(renderQuote(0.00000012, 'USD')).toContain('US$0.00000012');
  });

  it('缺少币种元数据时明确未知，不标成人民币', () => {
    const html = renderQuote(500.125);
    expect(html).toContain('500.125');
    expect(html.split('币种未知')).toHaveLength(3);
    expect(html).not.toContain('¥');
  });
});
