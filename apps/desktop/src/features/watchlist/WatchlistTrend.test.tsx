// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  WatchlistItem,
  WatchlistPrice,
  MarketRouteCatalogReadClientV3,
} from '@thesis-ledger/schemas';
import { WatchlistTrend } from './WatchlistTrend.js';
import type { MarketDetailQuery } from '@thesis-ledger/api-client';
type DetailOptions = MarketDetailQuery;
const getDetail = vi.hoisted(() => vi.fn<(symbol: string, options: DetailOptions) => Promise<unknown>>());
const getChartOptions = vi.hoisted(() => vi.fn());
vi.mock('../../shared/api/client.js', () => ({
  getDesktopApiClient: () => ({ market: { getDetail, getChartOptions } }),
}));
let clean = () => {};
afterEach(() => {
  act(clean);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  getDetail.mockReset();
  getChartOptions.mockReset();
});
it.each(['1m', '1d'] as const)(
  '%s 仅可见行请求；按来源刷新，后台暂停，失败保留图形，卸载取消请求',
  async (period) => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    let observe!: (visible: boolean) => void;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: unknown[]) => void) {
          observe = (isIntersecting) => cb([{ isIntersecting }]);
        }
        observe() {}
        disconnect() {}
      },
    );
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const detail = {
      symbol: '510300.SH',
      sections: { bars: { status: 'ready' } },
      barSeries: {
        provenance: { providerId: 'fixture', upstreamSource: 'fixture' },
        points: [
          { timestamp: '2026-11-06T03:00:00Z', open: 3.9, high: 4.2, low: 3.8, close: 4 },
          { timestamp: '2026-11-06T03:01:00Z', open: 4, high: 4.3, low: 3.9, close: 4.1 },
        ],
      },
    };
    getDetail.mockResolvedValue(detail);
    getChartOptions.mockResolvedValue({ options: [{ adjustment: 'none', available: true }] });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    clean = () => {
      root.unmount();
      client.clear();
      host.remove();
    };
    const item = {
      displayName: '测试ETF',
      instrument: { canonicalCode: '510300', market: 'SH', instrumentType: 'ETF', active: true },
    } as WatchlistItem;
    const snap = {
      minRefreshSeconds: 600,
      price: { kind: 'quote' },
      quoteContext: { session: 'trading' },
    } as WatchlistPrice;
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <WatchlistTrend
            catalog={
              {
                status: 'complete',
                entries: [
                  {
                    state: 'ready',
                    target: { providerId: 'fixture', upstreamSource: 'fixture' },
                    key: { kind: 'bar', market: 'CN', assetType: 'ETF', timeframe: '1m' },
                  },
                ],
              } as MarketRouteCatalogReadClientV3
            }
            item={item}
            snap={snap}
            period={period}
            queryRoot={['test']}
            select={() => {}}
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
    expect(getDetail).not.toHaveBeenCalled();
    await act(async () => { observe(true); await Promise.resolve(); });
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(getDetail).toHaveBeenCalledTimes(1);
    expect(getDetail.mock.calls[0]![1].include).toEqual(['bars']);
    expect(getDetail.mock.calls[0]![1]).toMatchObject({
      timeframe: period,
      adjustment: period === '1d' ? 'qfq' : 'none',
      barsLimit: period === '1d' ? 20 : 400,
    });
    if (period === '1d') {
      expect(getChartOptions).not.toHaveBeenCalled();
      expect(host.querySelector('svg')?.getAttribute('aria-label')).toContain('日K线');
    }
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(getDetail).toHaveBeenCalledTimes(2);
    await act(async () => {
      visibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(getDetail).toHaveBeenCalledTimes(2);
    getDetail.mockRejectedValueOnce(new Error('受控读取失败'));
    await act(async () => {
      visibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(host.querySelector('svg')).not.toBeNull();
    expect(host.textContent).toContain('受控读取失败');
    let signal!: AbortSignal;
    getDetail.mockImplementationOnce((_s, options) => {
      signal = options.signal!;
      return new Promise(() => {});
    });
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    act(clean);
    clean = () => {};
    expect(signal.aborted).toBe(true);
  },
);

it('分钟来源未配置时说明原因，不请求分钟柱或绘制价格轨迹', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
      observe() {
        this.callback([{ isIntersecting: true }]);
      }
      disconnect() {}
    },
  );
  getChartOptions.mockResolvedValue({
    options: [{ adjustment: 'none', available: false, reason: 'route_not_configured' }],
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clean = () => {
    root.unmount();
    client.clear();
    host.remove();
  };
  const item = {
    displayName: '测试ETF',
    instrument: { canonicalCode: '510300', market: 'SH', instrumentType: 'ETF', active: true },
  } as WatchlistItem;
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <WatchlistTrend item={item} period="1m" queryRoot={['unconfigured']} select={() => {}} />
      </QueryClientProvider>,
    );
    await Promise.resolve();
  });
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(getChartOptions).toHaveBeenCalledWith(
    '510300.SH',
    expect.any(AbortSignal),
    undefined,
    '1m',
  );
  expect(getDetail).not.toHaveBeenCalled();
  expect(host.textContent).toContain('未配置分钟行情来源');
  expect(host.querySelector('svg')).toBeNull();
});
