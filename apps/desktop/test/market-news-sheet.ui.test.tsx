// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MarketNewsSheet } from '../src/features/market-data/MarketNewsSheet.js';

const fetchNews = vi.hoisted(() => vi.fn());
const fetchFeed = vi.hoisted(() => vi.fn());
vi.mock('../src/features/market-data/market-news.api.js', () => ({ fetchMarketNews: fetchNews }));
vi.mock('../src/features/market-data/market-news-feed.api.js', () => ({
  fetchMarketNewsFeed: fetchFeed,
}));
let cleanup = () => {};
beforeEach(() => {
  fetchNews.mockReset();
  fetchFeed.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(async () => {
  await act(async () => cleanup());
  vi.unstubAllGlobals();
});
const button = (name: string) =>
  [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === name)!;
async function click(name: string) {
  await act(async () => button(name).click());
}
async function wait(check: () => void) {
  await vi.waitFor(async () => {
    await act(async () => new Promise((done) => setTimeout(done, 0)));
    check();
  });
}
async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient();
  cleanup = () => {
    root.unmount();
    client.clear();
    host.remove();
  };
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MarketNewsSheet />
      </QueryClientProvider>,
    ),
  );
  await click('新闻');
  await wait(() => expect(button('读取新闻')).toBeDefined());
}
it('市场快讯只在明确读取后发起，来源切换和关闭取消已有请求', async () => {
  fetchFeed.mockImplementation(() => new Promise(() => {}));
  await mount();
  await click('市场快讯');
  expect(fetchFeed).not.toHaveBeenCalled();
  expect(fetchNews).not.toHaveBeenCalled();
  await click('读取快讯');
  await wait(() => expect(fetchFeed).toHaveBeenCalledTimes(1));
  expect(fetchFeed.mock.calls[0]![0]).toMatchObject({ market: 'CN', providerId: 'cls', limit: 5 });
  expect(fetchFeed.mock.calls[0]![0]).not.toHaveProperty('instrument');
  const first = fetchFeed.mock.calls[0]![1] as AbortSignal;
  await click('华尔街见闻');
  expect(first.aborted).toBe(true);
  expect(document.body.textContent).not.toContain('正在读取市场快讯');
  await click('读取快讯');
  await wait(() => expect(fetchFeed).toHaveBeenCalledTimes(2));
  expect(fetchFeed.mock.calls[1]![0].providerId).toBe('wallstreetcn');
  const second = fetchFeed.mock.calls[1]![1] as AbortSignal;
  await click('关闭');
  expect(second.aborted).toBe(true);
});
it('市场快讯展示实际中文来源和市场范围限制', async () => {
  fetchFeed.mockResolvedValue({
    market: 'CN',
    status: 'partial',
    source: { providerId: 'cls', upstreamSource: 'cls-roll' },
    fetchedAt: '2026-10-22T12:00:00Z',
    items: [],
    errors: [],
    coverage: {
      returnedCount: 0,
      uniqueEvidenceCount: 0,
      publishedStart: null,
      publishedEnd: null,
      missingReasons: ['market_feed_first_page_not_exhaustive', 'provider_text_used_as_title'],
    },
  });
  await mount();
  await click('市场快讯');
  await click('读取快讯');
  await wait(() => expect(document.body.textContent).toContain('数据来源：财联社'));
  expect(document.body.textContent).toContain('不自动关联个股');
  expect(document.body.textContent).toContain('标题取自来源原有快讯文本');
});
it('显式读取前不调用来源，失败保留代码且只在点击后重试', async () => {
  fetchNews.mockRejectedValue(new Error('Failed to fetch'));
  await mount();
  expect(fetchNews).not.toHaveBeenCalled();
  await click('读取新闻');
  await wait(() => expect(document.body.textContent).toContain('网络连接中断'));
  expect(document.querySelector<HTMLInputElement>('input')!.value).toBe('600519.SH');
  expect(fetchNews.mock.calls[0]![0].instrument).toEqual({
    symbol: '600519.SH',
    market: 'CN',
    assetType: 'STOCK',
  });
  expect(fetchNews).toHaveBeenCalledTimes(1);
  await click('读取新闻');
  await wait(() => expect(fetchNews).toHaveBeenCalledTimes(2));
});
it('改换标的取消旧请求，关闭也释放当前请求', async () => {
  fetchNews.mockImplementation(() => new Promise(() => {}));
  await mount();
  await click('读取新闻');
  await wait(() => expect(fetchNews).toHaveBeenCalledTimes(1));
  const oldSignal = fetchNews.mock.calls[0]![1] as AbortSignal;
  const field = document.querySelector<HTMLInputElement>('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      field,
      'MSFT.US',
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(oldSignal.aborted).toBe(true);
  expect(document.body.textContent).not.toContain('正在读取新闻');
  await click('读取新闻');
  await wait(() => expect(fetchNews).toHaveBeenCalledTimes(2));
  const nextSignal = fetchNews.mock.calls[1]![1] as AbortSignal;
  expect(fetchNews.mock.calls[1]![0].instrument).toEqual({
    symbol: 'MSFT.US',
    market: 'US',
    assetType: 'STOCK',
  });
  await click('关闭');
  expect(nextSignal.aborted).toBe(true);
});
it('展示实际 HiThink 来源和首屏覆盖说明', async () => {
  fetchNews.mockResolvedValue({
    instrument: { symbol: '600519.SH', market: 'CN', assetType: 'STOCK' },
    status: 'partial',
    source: { providerId: 'hithink', upstreamSource: 'hithink-news-stock-timeline' },
    fetchedAt: '2026-10-22T00:00:00Z',
    coverage: {
      returnedCount: 0,
      uniqueEvidenceCount: 0,
      publishedStart: '2026-10-19T00:00:00Z',
      publishedEnd: '2026-10-22T00:00:00Z',
      missingReasons: ['timeline_window_not_exhaustive'],
    },
    items: [],
    errors: [],
  });
  await mount();
  await click('读取新闻');
  await wait(() => expect(document.body.textContent).toContain('数据来源：HiThink 同花顺'));
  expect(document.body.textContent).toContain('个股新闻仅返回当前一页');
});
it('展示 Yahoo 的实际来源和近期搜索缺口，并按美股代码读取', async () => {
  fetchNews.mockResolvedValue({
    instrument: { symbol: 'NVDA.US', market: 'US', assetType: 'STOCK' },
    status: 'partial',
    source: { providerId: 'yfinance', upstreamSource: 'yahoo-search-news' },
    fetchedAt: '2026-10-22T00:00:00Z',
    coverage: {
      returnedCount: 0,
      uniqueEvidenceCount: 0,
      publishedStart: '2026-10-19T00:00:00Z',
      publishedEnd: '2026-10-22T00:00:00Z',
      missingReasons: ['search_first_page_not_exhaustive'],
    },
    items: [],
    errors: [],
  });
  await mount();
  const field = document.querySelector<HTMLInputElement>('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      field,
      'NVDA.US',
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('读取新闻');
  await wait(() => expect(document.body.textContent).toContain('数据来源：Yahoo Finance 新闻'));
  expect(document.body.textContent).toContain('个股搜索仅返回近期第一页');
  expect(fetchNews.mock.calls[0]![0].instrument).toEqual({
    symbol: 'NVDA.US',
    market: 'US',
    assetType: 'STOCK',
  });
});
