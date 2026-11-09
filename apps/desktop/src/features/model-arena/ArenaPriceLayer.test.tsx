// @vitest-environment jsdom
import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ArenaPriceLayer } from './ArenaPriceLayer.js';
import type { MarketChartBar } from '../market-detail/market-chart-types.js';
const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), points: vi.fn(), add: vi.fn(), close: vi.fn(), mount: vi.fn(), unmount: vi.fn() }));
vi.mock('../../shared/api/client.js', () => ({ getDesktopApiClient: () => ({ modelArenas: { list: mocks.list, get: mocks.get, points: mocks.points } }) }));
vi.mock('@/components/ui/toast', () => ({ createToastManager: () => ({ add: mocks.add, close: mocks.close }) }));
vi.mock('./ArenaEmptyToast.js', () => ({ ArenaEmptyToast: () => null }));
vi.mock('../market-detail/MarketPriceLightweightChart.js', () => ({
  LightweightMarketChart: ({ tradingOverlays, onClick }: { tradingOverlays?: { arenaMarkers?: readonly unknown[] } | undefined; onClick: (day: string) => void }) => {
    const [zoom, setZoom] = useState(1);
    useEffect(() => { mocks.mount(); return () => { mocks.unmount(); }; }, []);
    return <button data-plot data-model-points={tradingOverlays?.arenaMarkers?.length ?? 0} onClick={() => { setZoom((value) => value + 1); onClick('2026-11-05'); }}>缩放 {zoom}</button>;
  },
}));
const bars: MarketChartBar[] = [{ symbol: '600036.SH', timeframe: '1d', adjustment: 'none', timestamp: '2026-11-06T07:00:00Z', open: 10, close: 10, high: 11, low: 9, volume: 1, amount: 10 }];
let host: HTMLDivElement, root: Root, client: QueryClient;
const flush = async (work: () => void | Promise<void>) => {
  await act(async () => { await work(); await new Promise((resolve) => setTimeout(resolve, 20)); });
};
const button = () => [...host.querySelectorAll('button')].find((node) => node.textContent === '模型模拟买卖点')!;
const selectOption = async (label: string, optionLabel: string) => {
  await flush(() => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent === optionLabel);
  expect(option, optionLabel).toBeDefined();
  await flush(() => { option!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
};
const render = () => flush(() => root.render(<MemoryRouter><QueryClientProvider client={client}><ArenaPriceLayer bars={bars} chartPoints={[]} indicators={[]} visibleRange={30} chartMode="candles" activePane="MACD" visibleIndicators={[]} visibleMA={[]} rsiPeriod={12} showBothPanes={false} focusLatestRevision={0} resetRevision={0} onClick={() => {}} onHover={() => {}} /></QueryClientProvider></MemoryRouter>));
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks(); sessionStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await flush(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

it('首次开启的空结果弹一次 Toast，返回关闭且图表节点与缩放保持', async () => {
  let resolve!: (value: []) => void;
  mocks.list.mockImplementation(() => new Promise<[]>((done) => { resolve = done; }));
  await render(); const plot = host.querySelector('[data-plot]') as HTMLButtonElement;
  await flush(() => plot.click()); expect(plot.textContent).toBe('缩放 2');
  await flush(() => button().click()); expect(mocks.add).not.toHaveBeenCalled();
  expect(host.querySelector('[data-plot]')).toBe(plot);
  await flush(() => resolve([]));
  expect(mocks.add).toHaveBeenCalledTimes(1); expect(button().getAttribute('aria-pressed')).toBe('false');
  expect(host.querySelector('[data-plot]')).toBe(plot); expect(plot.textContent).toBe('缩放 2');
  expect(mocks.mount).toHaveBeenCalledTimes(1); expect(mocks.unmount).not.toHaveBeenCalled();
});
it('恢复过的空结果自动关闭，随后第一下主动点击即可提示', async () => {
  sessionStorage.setItem('arena-layer:local-workspace:600036.SH', 'open');
  mocks.list.mockResolvedValue([]); await render(); await flush(() => {});
  expect(mocks.add).not.toHaveBeenCalled(); expect(button().getAttribute('aria-pressed')).toBe('false');
  await flush(() => button().click()); await flush(() => {});
  expect(mocks.add).toHaveBeenCalledTimes(1); expect(mocks.mount).toHaveBeenCalledTimes(1);
});
it('加载中关闭后，迟到空结果不会提示或重建图表', async () => {
  let resolve!: (value: []) => void;
  mocks.list.mockImplementation(() => new Promise<[]>((done) => { resolve = done; }));
  await render(); await flush(() => button().click()); await flush(() => button().click());
  await flush(() => resolve([]));
  expect(mocks.add).not.toHaveBeenCalled(); expect(button().getAttribute('aria-pressed')).toBe('false');
  expect(mocks.mount).toHaveBeenCalledTimes(1); expect(mocks.unmount).not.toHaveBeenCalled();
});
it('有效比赛仍可选择模型、绘制点位并跳转，关闭保留图表', async () => {
  sessionStorage.setItem(`arena-overlay:${window.location.origin}:local-workspace:600036.SH`, 'm1');
  mocks.list.mockResolvedValue([{ id: 'm1', protocol: { title: '测试比赛', instruments: [{ symbol: '600036.SH' }] } }]);
  mocks.get.mockResolvedValue({ entrants: [{ id: 'e1', model: '测试模型' }] });
  mocks.points.mockResolvedValue([{ id: 'p1', arenaId: 'm1', roundId: 'r1', entrantId: 'e1', model: '测试模型', symbol: '600036.SH', day: '2026-11-06', side: 'buy', quantity: '10', price: '10' }]);
  await render(); await flush(() => button().click()); await flush(() => {});
  expect(button().getAttribute('aria-pressed')).toBe('true');
  expect(button().className).toContain('bg-primary');
  expect(host.querySelector('[aria-label="模型筛选"]')?.textContent).toContain('全部模型');
  expect(host.querySelector('[data-plot]')?.getAttribute('data-model-points')).toBe('1');
  await selectOption('模型筛选', '测试模型');
  expect(mocks.points).toHaveBeenLastCalledWith('m1', expect.objectContaining({ entrantId: 'e1' }), expect.any(AbortSignal));
  const selection = host.querySelector('[data-arena-selection]')!;
  expect(selection.querySelector('[data-arena-point-details]')?.textContent).toContain('模拟成交 1 笔');
  expect(document.querySelector('a')).toBeNull();
  await flush(() => host.querySelector<HTMLButtonElement>('[data-arena-point-details]')!.click());
  const link = document.querySelector('[aria-label="模拟成交记录"] a');
  expect(link?.getAttribute('href')).toBe('/strategy/arena/m1/r1#model-e1');
  expect(link?.textContent).not.toContain('测试模型');
  expect(link?.getAttribute('title')).toBe('测试模型');
  expect(selection.compareDocumentPosition(host.querySelector('[data-plot]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(mocks.add).not.toHaveBeenCalled();
  await flush(() => button().click());
  expect(document.querySelector('[aria-label="模拟成交记录"]')).toBeNull(); expect(mocks.mount).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[data-plot]')?.getAttribute('data-model-points')).toBe('0');
});
it('大量成交收进滚动明细，支持键盘关闭和空日期恢复全部，图表保持', async () => {
  sessionStorage.setItem(`arena-overlay:${window.location.origin}:local-workspace:600036.SH`, 'm1');
  mocks.list.mockResolvedValue([{ id: 'm1', protocol: { title: '测试比赛', instruments: [{ symbol: '600036.SH' }] } }]);
  mocks.get.mockResolvedValue({ entrants: [{ id: 'e1', model: '测试模型' }] });
  mocks.points.mockResolvedValue(Array.from({ length: 50 }, (_, index) => ({ id: 'p' + index, arenaId: 'm1', roundId: 'r' + index, entrantId: 'e1', model: '测试模型', symbol: '600036.SH', day: '2026-11-06', side: 'buy', quantity: '10', price: '42.580000000001' })));
  await render(); await flush(() => button().click()); await flush(() => {});
  const trigger = host.querySelector<HTMLButtonElement>('[data-arena-point-details]')!;
  const plot = host.querySelector<HTMLButtonElement>('[data-plot]')!;
  expect(trigger.textContent).toContain('模拟成交 50 笔');
  expect(host.querySelector('a')).toBeNull();
  await flush(() => trigger.click());
  const records = document.querySelector('[aria-label="模拟成交记录"]')!;
  expect(records.querySelectorAll('a')).toHaveLength(50);
  expect(records.className).toContain('max-h-72');
  expect(records.className).toContain('overflow-y-auto');
  expect(records.textContent).toContain('42.580000000001');
  await flush(() => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(document.querySelector('[aria-label="模拟成交记录"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await flush(() => plot.click());
  expect(trigger.textContent).toContain('模拟成交 0 笔');
  await flush(() => trigger.click());
  expect(document.querySelector('[aria-label="模拟成交记录"]')?.textContent).toContain('所选图表日期没有模拟成交');
  const showAll = [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === '查看全部')!;
  await flush(() => showAll.click());
  expect(document.querySelectorAll('[aria-label="模拟成交记录"] a')).toHaveLength(50);
  expect(trigger.textContent).toContain('模拟成交 50 笔');
  expect(host.querySelector('[data-plot]')).toBe(plot);
  expect(mocks.mount).toHaveBeenCalledTimes(1);
});
it('模型下拉回显中文标签，切回全部恢复点位且保持图表实例', async () => {
  sessionStorage.setItem(`arena-overlay:${window.location.origin}:local-workspace:600036.SH`, 'm1');
  mocks.list.mockResolvedValue([{ id: 'm1', protocol: { title: '测试比赛', instruments: [{ symbol: '600036.SH' }] } }]);
  mocks.get.mockResolvedValue({ entrants: [{ id: 'e1', model: '模型甲' }, { id: 'e2', model: '模型乙' }] });
  const points = ['e1', 'e2'].map((entrantId, index) => ({ id: 'p' + index, arenaId: 'm1', roundId: 'r1', entrantId, model: entrantId, symbol: '600036.SH', day: '2026-11-06', side: 'buy', quantity: '10', price: '10' }));
  mocks.points.mockImplementation((_match, input: { entrantId?: string }) => Promise.resolve(points.filter(point => !input.entrantId || input.entrantId === point.entrantId)));
  await render(); await flush(() => button().click()); await flush(() => {});
  const plot = host.querySelector('[data-plot]');
  expect(plot?.getAttribute('data-model-points')).toBe('2');
  await selectOption('模型筛选', '模型甲');
  expect(host.querySelector('[aria-label="模型筛选"]')?.textContent).toContain('模型甲');
  expect(plot?.getAttribute('data-model-points')).toBe('1');
  expect(mocks.points).toHaveBeenLastCalledWith('m1', expect.objectContaining({ entrantId: 'e1' }), expect.any(AbortSignal));
  await selectOption('模型筛选', '模型乙');
  expect(host.querySelector('[aria-label="模型筛选"]')?.textContent).toContain('模型乙');
  expect(mocks.points).toHaveBeenLastCalledWith('m1', expect.objectContaining({ entrantId: 'e2' }), expect.any(AbortSignal));
  await selectOption('模型筛选', '全部模型');
  expect(host.querySelector('[aria-label="模型筛选"]')?.textContent).toContain('全部模型');
  expect(plot?.getAttribute('data-model-points')).toBe('2');
  expect(host.querySelector('[data-plot]')).toBe(plot);
  expect(mocks.mount).toHaveBeenCalledTimes(1);
});
it('比赛下拉切换重置模型并保留图表节点', async () => {
  mocks.list.mockResolvedValue(['m1', 'm2'].map((id, index) => ({ id, protocol: { title: `比赛${index + 1}`, instruments: [{ symbol: '600036.SH' }] } })));
  mocks.get.mockResolvedValue({ entrants: [{ id: 'e1', model: '模型甲' }] });
  mocks.points.mockResolvedValue([]);
  await render(); await flush(() => button().click()); await flush(() => {});
  const plot = host.querySelector('[data-plot]');
  await selectOption('模型比赛', '比赛1'); await flush(() => {});
  await selectOption('模型筛选', '模型甲');
  await selectOption('模型比赛', '比赛2'); await flush(() => {});
  expect(host.querySelector('[aria-label="模型比赛"]')?.textContent).toContain('比赛2');
  expect(host.querySelector('[aria-label="模型筛选"]')?.textContent).toContain('全部模型');
  expect(mocks.points).toHaveBeenLastCalledWith('m2', expect.not.objectContaining({ entrantId: 'e1' }), expect.any(AbortSignal));
  expect(host.querySelector('[data-plot]')).toBe(plot);
  expect(mocks.mount).toHaveBeenCalledTimes(1);
});
