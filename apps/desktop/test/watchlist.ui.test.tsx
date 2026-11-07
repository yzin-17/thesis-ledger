// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WatchlistPage } from '../src/features/watchlist/WatchlistPage.js';
const watchlist = vi.hoisted(() => ({
  list: vi.fn(),
  prices: vi.fn(),
  change: vi.fn(),
  add: vi.fn(),
}));
const search = vi.hoisted(() => vi.fn());
vi.mock('../src/shared/api/client.js', () => ({
  getDesktopApiClient: () => ({ watchlist, market: { searchInstruments: search } }),
}));
vi.mock('../src/features/portfolio/portfolio-mode-context.js', () => ({
  usePortfolioMode: () => ({ mode: 'actual' }),
}));
vi.mock('../src/features/market-detail/MarketDetailDialog.js', () => ({
  MarketDetailDialog: ({ position }: { position: { symbol: string } }) => (
    <div>{position.symbol} 行情详情</div>
  ),
}));
let cleanup = () => {};
const id = '00000000-0000-4000-8000-000000000001';
const item = {
  id,
  displayName: '目录名称',
  pinned: false,
  groupId: null,
  order: 0,
  addedAt: '2026-11-05T00:00:00Z',
  instrument: { id, canonicalCode: '000001', market: 'SZ', instrumentType: 'STOCK', active: true },
};
const page = { revision: 1, items: [item], groups: [{ id, name: '长期关注' }], nextOffset: null };
const button = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
const wait = async (fn: () => void) =>
  vi.waitFor(async () => {
    await act(async () => new Promise((done) => setTimeout(done, 0)));
    fn();
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  notifyManager.setNotifyFunction((notify) => {
    act(notify);
  });
});
afterEach(() => {
  act(cleanup);
  notifyManager.setNotifyFunction((notify) => notify());
  vi.unstubAllGlobals();
});
async function mount() {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cleanup = () => {
    root.unmount();
    client.clear();
    node.remove();
  };
  await act(async () =>
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <WatchlistPage />
        </QueryClientProvider>
      </MemoryRouter>,
    ),
  );
}
it('切组取消旧行情请求，并以稳定身份打开详情', async () => {
  const newerId = '00000000-0000-4000-8000-000000000002';
  watchlist.list.mockImplementation(async (query) =>
    query.group ? { ...page, items: [{ ...item, id: newerId }] } : page,
  );
  const signals: AbortSignal[] = [];
  watchlist.prices.mockImplementation((_ids, _mode, signal) => {
    signals.push(signal);
    return new Promise(() => {});
  });
  await mount();
  await wait(() => expect(signals.length).toBe(1));
  await act(async () => button('长期关注').click());
  await wait(() => expect(signals[0]?.aborted).toBe(true));
  await act(async () =>
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent?.startsWith('目录名称'))!
      .click(),
  );
  await wait(() => expect(document.body.textContent).toContain('000001.SZ 行情详情'));
});
it('报价失败后仍能管理分组，冲突后重读服务端修订', async () => {
  watchlist.list.mockResolvedValue(page);
  watchlist.prices.mockRejectedValue(new Error('来源失败'));
  watchlist.change.mockRejectedValue(new Error('自选已在其他页面更新'));
  await mount();
  await wait(() => expect(document.body.textContent).toContain('来源失败'));
  await act(async () => button('管理分组').click());
  const field = document.querySelector('input[aria-label="分组名称"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '新增');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => button('新建分组').click());
  await wait(() =>
    expect(watchlist.change).toHaveBeenCalledWith({
      action: 'createGroup',
      name: '新增',
      revision: 1,
    }),
  );
  await wait(() => expect(watchlist.list.mock.calls.length).toBeGreaterThan(1));
});

it('页头刷新保留表格行，直到名单和行情都已返回', async () => {
  watchlist.list.mockResolvedValue(page);
  watchlist.prices.mockResolvedValue([]);
  await mount();
  const refresh = () =>
    document.querySelector<HTMLButtonElement>('header [aria-label="刷新自选"]')!;
  const indicator = () => document.querySelector('[role="status"][aria-label="正在刷新自选"]');
  await wait(() => expect(refresh().disabled).toBe(false));
  const row = document.querySelector('tbody tr');
  expect(row?.textContent).toContain('目录名称');
  let finishList!: () => void;
  let finishPrices!: () => void;
  watchlist.list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishList = () => resolve(page);
      }),
  );
  watchlist.prices.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishPrices = () => resolve([]);
      }),
  );
  await act(async () => refresh().click());
  await wait(() => expect(indicator()?.parentElement?.contains(row)).toBe(true));
  await act(async () => finishList());
  expect(indicator()).toBeTruthy();
  expect(document.querySelector('tbody tr')).toBe(row);
  await act(async () => finishPrices());
  await wait(() => expect(indicator()).toBeNull());
  expect(refresh().disabled).toBe(false);
});
