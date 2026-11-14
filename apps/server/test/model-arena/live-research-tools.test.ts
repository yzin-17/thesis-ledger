import { expect, it, vi } from 'vitest';
import { LiveResearchTools } from '../../src/model-arena/live/live-research-tools.js';
import { ResearchPublicSearch } from '../../src/ai/research-public-search.js';
import { liveProtocolFixture } from './live-fixture.js';
function setup() {
  const instruments = { search: vi.fn().mockResolvedValue([{ id: 'a', symbol: 'AAPL.US', displayName: '苹果', instrumentType: 'STOCK' }]),
    resolveCanonicalSymbols: vi.fn().mockResolvedValue({ items: [{ symbol: 'AAPL.US', market: 'US', assetType: 'STOCK' }] }) };
  const market = { getQuote: vi.fn().mockResolvedValue({ symbol: 'AAPL.US', price: 10 }) };
  const series = { read: vi.fn().mockResolvedValue({ status: 'ready' }) }, news = { read: vi.fn() }, search = { read: vi.fn().mockResolvedValue({ status: 'ready', items: [] }) };
  const tools = new LiveResearchTools(instruments as never, market as never, series as never, news as never, search as never);
  return { tools, instruments, market, series, news, search, p: liveProtocolFixture(), signal: new AbortController().signal };
}
it('全市场目录检索在查询前限定市场和资产，返回当前目录名称', async () => {
  const s = setup(), result = await s.tools.execute(s.p, { name: 'search_instruments', query: '苹果' }, s.signal);
  expect(s.instruments.search).toHaveBeenCalledWith('苹果', 20, { markets: ['US'], types: ['STOCK', 'ETF'] });
  expect(result).toEqual({ items: [{ instrumentId: 'a', symbol: 'AAPL.US', name: '苹果', assetType: 'STOCK' }] });
});
it('固定标的池拒绝越界读；全市场仍核对唯一目录身份', async () => {
  const s = setup();
  await expect(s.tools.execute({ ...s.p, universe: 'fixed', instruments: [{ instrumentId: 'x', symbol: 'MSFT.US', assetType: 'STOCK' }] }, { name: 'quote', symbol: 'AAPL.US' }, s.signal)).rejects.toThrow('symbol_outside_universe');
  expect(s.instruments.resolveCanonicalSymbols).not.toHaveBeenCalled(); expect(s.market.getQuote).not.toHaveBeenCalled();
  s.instruments.resolveCanonicalSymbols.mockResolvedValue({ items: [{ symbol: 'AAPL.US', market: 'HK', assetType: 'STOCK' }] });
  await expect(s.tools.execute(s.p, { name: 'quote', symbol: 'AAPL.US' }, s.signal)).rejects.toThrow('symbol_outside_universe');
  expect(s.market.getQuote).not.toHaveBeenCalled();
});
it('行情、K线及指标按需读取，不遍历全市场', async () => {
  const s = setup();
  await s.tools.execute(s.p, { name: 'quote', symbol: 'AAPL.US' }, s.signal);
  await s.tools.execute(s.p, { name: 'bars', symbol: 'AAPL.US', timeframe: '60m', limit: 20 }, s.signal);
  await s.tools.execute(s.p, { name: 'indicators', symbol: 'AAPL.US', timeframe: '5m', indicator: 'RSI' }, s.signal);
  expect(s.market.getQuote).toHaveBeenCalledOnce();
  expect(s.series.read).toHaveBeenCalledWith({ symbol: 'AAPL.US', assetType: 'STOCK', timeframe: '60m', limit: 20 });
  expect(s.series.read).toHaveBeenCalledWith({ symbol: 'AAPL.US', assetType: 'STOCK', timeframe: '5m', limit: 5, indicator: 'RSI' });
  expect(s.news.read).not.toHaveBeenCalled(); expect(s.search.read).not.toHaveBeenCalled();
});
it('指标历史窗口可显式扩大，非法窗口在请求数据前拒绝', async () => {
  const s = setup();
  await s.tools.execute(s.p, { name: 'indicators', symbol: 'AAPL.US', timeframe: '5m', indicator: 'RSI', limit: 100 }, s.signal);
  expect(s.series.read).toHaveBeenCalledWith({ symbol: 'AAPL.US', assetType: 'STOCK', timeframe: '5m', limit: 100, indicator: 'RSI' });
  s.series.read.mockClear();
  await expect(s.tools.execute(s.p, { name: 'indicators', symbol: 'AAPL.US', timeframe: '5m', indicator: 'RSI', limit: 101 }, s.signal)).rejects.toThrow();
  expect(s.series.read).not.toHaveBeenCalled();
});
it('搜索开关由服务端强制执行，开启时传递本场市场和取消信号', async () => {
  const s = setup();
  await expect(s.tools.execute({ ...s.p, allowWebSearch: false }, { name: 'web_search', query: '公开资料' }, s.signal)).rejects.toThrow('web_search_disabled');
  expect(s.search.read).not.toHaveBeenCalled();
  await s.tools.execute({ ...s.p, allowWebSearch: true }, { name: 'web_search', query: '公开资料' }, s.signal);
  expect(s.search.read).toHaveBeenCalledWith('公开资料', 'US', s.signal);
});
it('取消与未接入的私有操作均不会执行来源请求', async () => {
  const s = setup(), controller = new AbortController(); controller.abort();
  await expect(s.tools.execute(s.p, { name: 'quote', symbol: 'AAPL.US' }, controller.signal)).rejects.toThrow();
  await expect(s.tools.execute(s.p, { name: 'place_order', symbol: 'AAPL.US' }, s.signal)).rejects.toThrow();
  expect(s.market.getQuote).not.toHaveBeenCalled(); expect(s.search.read).not.toHaveBeenCalled();
});
it('通用搜索网关核对市场、检索词与条数，不把响应错误当成空搜索', async () => {
  const response = { status: 'ready', market: 'US', query: '行业', provider: 'controlled', coverage: 'last_year', upstreamAttempts: 1, observedAt: new Date().toISOString(), reason: null, items: [] };
  const post = vi.fn().mockResolvedValue(response), gateway = new ResearchPublicSearch({ post } as never), signal = new AbortController().signal;
  expect(await gateway.read('行业', 'US', signal)).toEqual(response);
  expect(post).toHaveBeenCalledWith('/api/v3/thesis-ledger/research/search', { market: 'US', query: '行业', limit: 5 }, 1, undefined, 15000, signal);
  post.mockResolvedValue({ ...response, market: 'HK' });
  await expect(gateway.read('行业', 'US', signal)).rejects.toThrow('search_response_mismatch');
});
