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
vi.mock('../src/shared/api/client.js', () => ({
  getDesktopApiClient: () => ({ market: { searchInstruments: async () => [] } }),
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
async function mount(symbol = '600519.SH') {
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
  await click('查看新闻');
  await wait(() => expect(button('读取新闻')).toBeDefined());
  if (symbol) await enter('股票代码', symbol);
}
async function enter(label: string, value: string) {
  const field = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('blur', { bubbles: true }));
  });
}
async function chooseRange(label: string) {
  const field = document.querySelector<HTMLButtonElement>('button[role="combobox"]')!;
  await act(async () => field.click());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent?.trim() === label)!;
  await act(async () => {
    const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(down, 'pointerType', { value: 'mouse' });
    option.dispatchEvent(down);
    option.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1 }));
  });
  expect(field.textContent).toContain(label);
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

function pageResult(ids: string[], cursor: string | null) {
  return {
    instrument: { symbol: '600519.SH', market: 'CN', assetType: 'STOCK' },
    status: cursor ? 'partial' : 'available',
    source: { providerId: 'hithink', upstreamSource: 'hithink-news-stock-timeline' },
    fetchedAt: '2026-11-09T12:00:00Z', upstreamAttempts: 1, errors: [], nextCursor: cursor,
    items: ids.map((id) => ({ id, title: `新闻${id}`, url: `https://news.10jqka.com.cn/${id}`,
      originalUrl: null, evidenceGroupId: id, publishedAt: '2026-11-09T11:00:00Z', fetchedAt: '2026-11-09T12:00:00Z',
      sourceAvailableAt: null, publisher: '受控媒体' })),
    coverage: { complete: !cursor, truncated: Boolean(cursor), returnedCount: ids.length,
      uniqueEvidenceCount: ids.length, unknownPublishedTimeCount: 0, examinedCount: ids.length,
      publishedStart: '2026-11-06T12:00:00Z', publishedEnd: '2026-11-09T12:00:00Z',
      missingReasons: cursor ? ['pagination_truncated'] : [] },
  };
}

it('加载更多固定原查询窗口，失败保留首页，重试同游标追加去重并确认耗尽', async () => {
  fetchNews.mockResolvedValueOnce(pageResult(['1', '2'], 'controlled-next'))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(pageResult(['2', '3'], null));
  await mount();
  await click('读取新闻');
  await wait(() => expect(button('加载更多')).toBeDefined());
  expect(document.body.textContent).toContain('已加载 2 条');
  expect(document.body.textContent).not.toContain('部分覆盖');
  expect(document.body.textContent).not.toContain('覆盖范围有缺口');
  const first = fetchNews.mock.calls[0]![0];
  await click('加载更多');
  await wait(() => expect(button('重试加载')).toBeDefined());
  expect(document.body.textContent).toContain('新闻1');
  expect(document.body.textContent).toContain('新闻2');
  expect(fetchNews.mock.calls[1]![0]).toEqual({ ...first, cursor: 'controlled-next' });
  await click('重试加载');
  await wait(() => expect(document.body.textContent).toContain('已加载完毕'));
  expect(fetchNews.mock.calls[2]![0]).toEqual(fetchNews.mock.calls[1]![0]);
  expect(document.querySelectorAll('ol li')).toHaveLength(3);
  expect(document.body.textContent).toContain('3 条');
  expect(button('加载更多')).toBeUndefined();
  expect(document.body.textContent).not.toContain('覆盖范围有缺口');
});

it('空页仍能继续加载，修改范围取消在途下一页且不混入旧数据', async () => {
  fetchNews.mockResolvedValueOnce(pageResult([], 'empty-page-next'))
    .mockImplementationOnce(() => new Promise(() => {}));
  await mount();
  await click('读取新闻');
  await wait(() => expect(button('加载更多')).toBeDefined());
  expect(document.body.textContent).toContain('可继续加载');
  await click('加载更多');
  await wait(() => expect(fetchNews).toHaveBeenCalledTimes(2));
  const signal = fetchNews.mock.calls[1]![1] as AbortSignal;
  await chooseRange('最近 7 天');
  expect(signal.aborted).toBe(true);
  expect(document.querySelector('ol')).toBeNull();
  expect(document.body.textContent).not.toContain('已加载完毕');
});

it.each([
  ['next-page', ['pagination_truncated', 'published_time_unknown'], '部分消息的发布时间未知'],
  [null, ['pagination_truncated'], '结果受到条数或订阅范围限制'],
] as const)('真实覆盖限制仍保留，分页状态为 %s', async (cursor, reasons, message) => {
  const data = pageResult(['1'], cursor);
  data.status = 'partial';
  data.coverage.complete = false;
  data.coverage.truncated = true;
  data.coverage.missingReasons = [...reasons];
  if (reasons.some((reason) => reason === 'published_time_unknown')) data.coverage.unknownPublishedTimeCount = 1;
  fetchNews.mockResolvedValue(data);
  await mount();
  await click('读取新闻');
  await wait(() => expect(document.body.textContent).toContain(message));
  expect(document.body.textContent).toContain('部分覆盖');
  expect(document.body.textContent).toContain('覆盖范围有缺口');
});

it('初始不预填示例标的，时间范围切换不自动读取并取消旧请求', async () => {
  fetchNews.mockImplementation(() => new Promise(() => {}));
  await mount('');
  const symbol = document.querySelector<HTMLInputElement>('input[aria-label="股票代码"]')!;
  expect(symbol.value).toBe('');
  expect(symbol.placeholder).toBe('');
  await click('读取新闻');
  expect(fetchNews).not.toHaveBeenCalled();
  await enter('股票代码', '600519.SH');
  await chooseRange('最近 7 天');
  expect(fetchNews).not.toHaveBeenCalled();
  await click('读取新闻');
  await wait(() => expect(fetchNews).toHaveBeenCalledTimes(1));
  const [request, signal] = fetchNews.mock.calls[0]!;
  expect(Date.parse(request.publishedEnd) - Date.parse(request.publishedStart)).toBe(7 * 86_400_000);
  await chooseRange('最近 30 天');
  expect(signal.aborted).toBe(true);
  expect(fetchNews).toHaveBeenCalledTimes(1);
});

it('快讯自定义日期阻止空日期和倒置范围，有效整日范围可提交并重试', async () => {
  fetchFeed.mockRejectedValue(new Error('Failed to fetch'));
  await mount('');
  await click('市场快讯');
  await chooseRange('自定义日期范围');
  await click('读取快讯');
  expect(fetchFeed).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('请选择起始日期和截止日期');
  await enter('起始日期', '2026-11-09');
  await enter('截止日期', '2026-11-08');
  await click('读取快讯');
  expect(fetchFeed).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('截止日期不能早于起始日期');
  await enter('截止日期', '2026-11-09');
  await click('读取快讯');
  await wait(() => expect(fetchFeed).toHaveBeenCalledTimes(1));
  const request = fetchFeed.mock.calls[0]![0];
  expect(new Date(request.publishedStart).getHours()).toBe(0);
  expect(new Date(request.publishedEnd).getHours()).toBe(23);
  expect(new Date(request.publishedEnd).getMilliseconds()).toBe(999);
  await wait(() => expect(document.body.textContent).toContain('网络连接中断'));
  await click('读取快讯');
  await wait(() => expect(fetchFeed).toHaveBeenCalledTimes(2));
  expect(fetchFeed.mock.calls[1]![0]).toEqual(request);
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
