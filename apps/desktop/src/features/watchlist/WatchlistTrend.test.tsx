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
const getDetail = vi.hoisted(() => vi.fn());
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
});
it('仅可见行请求；一分钟刷新，后台暂停，失败保留曲线，卸载取消请求', async () => {
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
        { timestamp: '2026-11-06T03:00:00Z', close: 4 },
        { timestamp: '2026-11-06T03:01:00Z', close: 4.1 },
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
  await act(async () =>
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
          period="1m"
          queryRoot={['test']}
          select={() => {}}
        />
      </QueryClientProvider>,
    ),
  );
  expect(getDetail).not.toHaveBeenCalled();
  await act(async () => observe(true));
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(getDetail).toHaveBeenCalledTimes(1);
  expect(getDetail.mock.calls[0]![1].include).toEqual(['bars']);
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(getDetail).toHaveBeenCalledTimes(2);
  await act(async () => {
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await act(async () => vi.advanceTimersByTimeAsync(120_000));
  expect(getDetail).toHaveBeenCalledTimes(2);
  getDetail.mockRejectedValueOnce(new Error('受控读取失败'));
  await act(async () => {
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(host.querySelector('svg')).not.toBeNull();
  expect(host.textContent).toContain('受控读取失败');
  let signal!: AbortSignal;
  getDetail.mockImplementationOnce((_s, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  act(clean);
  clean = () => {};
  expect(signal.aborted).toBe(true);
});
