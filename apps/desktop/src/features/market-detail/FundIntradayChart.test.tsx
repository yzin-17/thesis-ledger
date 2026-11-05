// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FundIntradayChart } from './FundIntradayChart.js';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), setData: vi.fn<(points: unknown[]) => void>(), createPriceLine: vi.fn(),
  crosshair: undefined as ((event: { time?: unknown }) => void) | undefined,
  click: undefined as ((event: { time?: unknown }) => void) | undefined,
}));
vi.mock('../../shared/api/client.js', () => ({ getDesktopApiClient: () => ({ market: { getFundValuationToday: mocks.get } }) }));
vi.mock('lightweight-charts', () => ({
  CrosshairMode: { Normal: 0 }, LineSeries: {},
  createChart: () => ({
    addSeries: () => ({ setData: mocks.setData, createPriceLine: mocks.createPriceLine }),
    removeSeries: vi.fn(), remove: vi.fn(),
    timeScale: () => ({ getVisibleRange: () => null, setVisibleRange: vi.fn(), fitContent: vi.fn() }),
    subscribeCrosshairMove: (handler: typeof mocks.crosshair) => { mocks.crosshair = handler; },
    subscribeClick: (handler: typeof mocks.click) => { mocks.click = handler; },
    unsubscribeCrosshairMove: vi.fn(), unsubscribeClick: vi.fn(),
  }),
}));
const point = (minute: number, estimatedNav: number | null) => ({
  at: `2026-11-04T06:0${minute}:00Z`,
  valuation: { estimatedNav, changePercent: estimatedNav === null ? null : (estimatedNav - 1) * 100,
    anchor: { unitNav: 1, navDate: '2026-11-03T00:00:00Z' }, quality: estimatedNav === null ? 'unavailable' : 'partial' },
});
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const interact = async (work: () => void) => act(async () => { work(); await Promise.resolve(); });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await interact(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
const mount = async (onHistory = vi.fn()) => {
  await interact(() => root.render(<QueryClientProvider client={client}><FundIntradayChart symbol="000001.OF" onHistory={onHistory} /></QueryClientProvider>));
  await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
};

describe('今日基金估值视图', () => {
  it('绘制真实分钟点与正式净值基准，缺价悬停不借用邻近值，锁定可解锁', async () => {
    mocks.get.mockResolvedValue({ date: '2026-11-04', points: [point(0, 1.01), point(1, null), point(2, 1.02)] });
    const onHistory = vi.fn(); await mount(onHistory);
    expect(mocks.get).toHaveBeenCalledWith('000001.OF', expect.any(AbortSignal));
    expect(mocks.setData.mock.calls.map((call) => call[0])).toEqual([
      [{ time: Date.parse('2026-11-04T06:00:00Z') / 1000, value: 1.01 }],
      [{ time: Date.parse('2026-11-04T06:02:00Z') / 1000, value: 1.02 }],
      [0, 1, 2].map((minute) => ({ time: Date.parse(`2026-11-04T06:0${minute}:00Z`) / 1000 })),
    ]);
    expect(mocks.createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 1, title: '正式净值 11-03' }));
    const footer = host.querySelector('[data-market-nav-readout]');
    await interact(() => mocks.crosshair?.({ time: Date.parse('2026-11-04T06:01:00Z') / 1000 }));
    expect(footer?.textContent).toContain('盘中估值 —');
    await interact(() => mocks.click?.({ time: Date.parse('2026-11-04T06:00:00Z') / 1000 }));
    expect(footer?.textContent).toContain('已锁定');
    await interact(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(footer?.textContent).not.toContain('已锁定');
    expect(host.querySelector('[data-market-nav-readout]')).toBe(footer);
    await interact(() => [...host.querySelectorAll('button')].find((button) => button.textContent === '历史净值')!.click());
    expect(onHistory).toHaveBeenCalledOnce();
    mocks.get.mockRejectedValueOnce(new Error('refresh-failed'));
    await act(() => client.refetchQueries({ queryKey: ['market', 'fund-valuation-today'] }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(host.textContent).toContain('读取失败');
    expect(host.textContent).toContain('1.0200');
  });
  it('空历史不造曲线，失败提供重试', async () => {
    mocks.get.mockRejectedValueOnce(new Error('failed')); await mount();
    expect(host.textContent).toContain('估值读取失败');
    mocks.get.mockResolvedValueOnce({ date: '2026-11-04', points: [] });
    await interact(() => [...host.querySelectorAll('button')].find((button) => button.textContent === '重试今日估值')!.click());
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(host.textContent).toContain('暂无盘中估值'); expect(mocks.setData).not.toHaveBeenCalled();
  });
});
