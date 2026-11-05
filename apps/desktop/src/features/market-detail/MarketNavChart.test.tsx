// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fundNavHistorySchema } from '@thesis-ledger/schemas';
import type { AutoscaleInfoProvider } from 'lightweight-charts';
import { FundNavHistoryChart } from './MarketNavChart.js';

const chart = vi.hoisted(() => ({
  setData: vi.fn(),
  setVisibleRange: vi.fn(),
  crosshair: undefined as undefined | ((event: { time: string }) => void),
  click: undefined as undefined | ((event: { time: string }) => void),
  seriesOptions: [] as Array<Record<string, unknown>>,
  applyOptions: vi.fn(),
  createPriceLine: vi.fn(),
}));

vi.mock('lightweight-charts', () => ({
  CrosshairMode: { Normal: 0 },
  LineSeries: {},
  createChart: () => ({
    addSeries: (_: unknown, options: Record<string, unknown>) => {
      chart.seriesOptions.push(options);
      return { setData: chart.setData, createPriceLine: chart.createPriceLine };
    },
    applyOptions: chart.applyOptions,
    removeSeries: vi.fn(),
    timeScale: () => ({
      setVisibleRange: chart.setVisibleRange,
      getVisibleRange: () => null,
      subscribeVisibleTimeRangeChange: vi.fn(),
      unsubscribeVisibleTimeRangeChange: vi.fn(),
    }),
    subscribeCrosshairMove: (handler: typeof chart.crosshair) => { chart.crosshair = handler; },
    subscribeClick: (handler: typeof chart.click) => { chart.click = handler; },
    unsubscribeCrosshairMove: vi.fn(),
    unsubscribeClick: vi.fn(),
    remove: vi.fn(),
  }),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  chart.seriesOptions = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('基金净值图的日级日期', () => {
  it('多个有效盈亏时点绘制独立曲线，净值和盈亏分别使用右轴与左轴', () => {
    const history = fundNavHistorySchema.parse([1, 1.2].map((unitNav, index) => ({
      version: 3, symbol: '000001.OF', navDate: `2026-11-0${index + 1}T00:00:00Z`, unitNav,
      provider: 'fixture', fetchedAt: '2026-11-04T00:00:00Z', freshness: 'delayed',
    })));
    const points = [10, 30].map((value, index) => ({
      at: `2026-11-0${index + 1}T08:00:00Z`, value, unrealizedPnl: value,
      realizedPnl: 0, reason: null, current: false,
    }));
    act(() => root.render(<FundNavHistoryChart history={history} pnl={{ points, currency: 'CNY' }} />));
    expect(chart.seriesOptions.map((options) => options.priceScaleId)).toEqual(['right', 'left']);
    expect(chart.seriesOptions[1]).toMatchObject({ lineStyle: 2, pointMarkersVisible: false });
    expect(chart.setData).toHaveBeenCalledWith([{ time: '2026-11-01', value: 10 }, { time: '2026-11-02', value: 30 }]);
    expect(container.textContent).not.toContain('单点');
  });
  it('同图使用左右独立刻度，并将最新盈亏日期纳入共享时间轴，悬停不借用其他日期值', () => {
    const history = fundNavHistorySchema.parse([{ version: 3, symbol: '000001.OF', navDate: '2026-11-03T00:00:00Z', unitNav: 0.895, provider: 'fixture', fetchedAt: '2026-11-04T00:00:00Z', freshness: 'delayed' }]);
    const points = [{ at: '2026-11-04T01:00:00Z', value: -19.45, unrealizedPnl: -29.45, realizedPnl: 10, reason: null, current: true }];
    act(() => root.render(<FundNavHistoryChart history={history} pnl={{ points, currency: 'CNY' }} />));
    expect(container.querySelectorAll('[data-market-nav-chart]')).toHaveLength(1);
    expect(chart.seriesOptions.map((options) => options.priceScaleId)).toEqual(['right', 'left']);
    const scale = chart.seriesOptions[1]!.autoscaleInfoProvider as AutoscaleInfoProvider;
    expect(scale(() => ({ priceRange: { minValue: -29.5, maxValue: -29.4 } }))?.priceRange).toEqual({ minValue: -29.5, maxValue: 0 });
    expect(chart.createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 0 }));
    expect(chart.setData).toHaveBeenCalledWith([{ time: '2026-11-04', value: -19.45 }]);
    expect(chart.setVisibleRange).toHaveBeenLastCalledWith({ from: '2026-08-04', to: '2026-11-04' });
    expect(container.textContent).toContain('累计盈亏 -¥19.45');
    expect(container.textContent).toContain('单位净值 0.895');
    act(() => chart.crosshair?.({ time: '2026-11-03' }));
    expect(container.textContent).toContain('单位净值 0.895');
    expect(container.textContent).toContain('累计盈亏 —');
    act(() => chart.crosshair?.({ time: '2026-11-04' }));
    expect(container.textContent).toContain('单位净值 —');
    expect(container.textContent).toContain('累计盈亏 -¥19.45');
  });
  it.each(['T00:00:00.000Z', 'T00:00:00+08:00'])('接受日期后缀 %s，并保持悬停和锁定的净值匹配', (suffix) => {
    const history = fundNavHistorySchema.parse(['2026-07-01', '2026-07-02'].map((date, index) => ({
      version: 3,
      symbol: '000001.OF',
      navDate: date + suffix,
      unitNav: index === 0 ? 1.1111 : 1.2222,
      provider: 'fixture',
      fetchedAt: '2026-10-16T00:00:00.000Z',
      freshness: 'delayed',
    })));

    act(() => root.render(<FundNavHistoryChart history={history} />));
    expect(chart.setData).toHaveBeenLastCalledWith([
      { time: '2026-07-01', value: 1.1111 },
      { time: '2026-07-02', value: 1.2222 },
    ]);
    expect(chart.setVisibleRange).toHaveBeenLastCalledWith({ from: '2026-04-02', to: '2026-07-02' });
    act(() => chart.crosshair?.({ time: '2026-07-01' }));
    expect(container.textContent).toContain('悬停 2026-07-01');
    expect(container.textContent).toContain('单位净值 1.1111');
    act(() => chart.click?.({ time: '2026-07-01' }));
    expect(container.textContent).toContain('已锁定 2026-07-01');
    expect(history[0]?.navDate).toBe('2026-07-01' + suffix);
  });
});
