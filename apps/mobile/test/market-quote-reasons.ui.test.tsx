import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { marketDisplayDetailResponseSchema } from '@thesis-ledger/schemas';
import { MarketQuotePanel } from '../src/features/market-detail/MarketQuotePanel';
import { MarketCurrentQuote } from '../src/features/market-detail/MarketCurrentQuote';
vi.mock('../src/components/MobilePrimitives', () => ({
  Copy: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Section: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));
vi.mock('../src/platform/charts/MobileChart', () => ({ MobileChart: () => null }));

it('移动端消费报价原因、HTTP 状态和独立时点', () => {
  const detail = marketDisplayDetailResponseSchema.parse({
    contractVersion: 3, symbol: '600519.SH', assetType: 'STOCK',
    requestId: 'controlled', generatedAt: '2026-11-09T02:00:00Z',
    identity: { source: 'asset', status: 'confirmed' }, requested: ['quote'],
    capabilities: { supported: ['quote'], unsupported: [] }, limits: { bars: 90, nav: 90 },
    dependencies: {}, sections: { quote: { capability: 'quote', status: 'stale', data: {
      version: 3, symbol: '600519.SH', price: 10, open: 10, high: 11, low: 9,
      previousClose: 10, volume: null, amount: null, provider: 'fixture',
      stale: true, freshness: 'stale', marketTime: '2026-11-06T07:00:00Z', fetchedAt: '2026-11-09T02:00:00Z',
      refreshFailure: 'fetch_failed', staleReason: { code: 'rate_limited', message: '数据源限制了请求频率。', httpStatus: 429 },
    } } },
  });
  const html = renderToStaticMarkup(<MarketQuotePanel detail={detail} />);
  expect(html).toContain('刷新失败，保留旧数据');
  expect(html).toContain('数据源限制了请求频率。');
  expect(html).toContain('HTTP 429');
  expect(html).toContain('行情时间：');
  expect(html).toContain('抓取时间：');
});

it('移动端正常休市快照保留正常层级，两个时点分别成段', () => {
  const html = renderToStaticMarkup(<MarketCurrentQuote quote={{
    version: 3, symbol: '510300.SH', price: 4.124, open: 4.113, high: 4.169, low: 4.095,
    previousClose: 4.195, volume: null, amount: null, provider: 'tencent', stale: false,
    freshness: 'delayed', marketTime: '2026-11-06T08:14:52Z', fetchedAt: '2026-11-09T02:00:00Z',
    sessionContext: { session: 'closed_snapshot', evaluatedAt: '2026-11-09T02:00:00Z', latestTradingDate: '2026-11-06' },
  }} />);
  expect(html).toContain('休市快照'); expect(html).not.toContain('陈旧');
  expect(html).toMatch(/<p>行情时间：[^<]+<\/p>/);
  expect(html).toMatch(/<p>抓取时间：[^<]+<\/p>/);
});
