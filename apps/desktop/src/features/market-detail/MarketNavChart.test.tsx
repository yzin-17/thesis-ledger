// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fundNavHistorySchema } from '@thesis-ledger/schemas';
import type { AutoscaleInfoProvider } from 'lightweight-charts';
import { FundNavHistoryChart } from './MarketNavChart.js';
import type { FundNavTrades } from './useFundNavTrades.js';

const chart = vi.hoisted(() => ({
  setData: vi.fn(),
  setVisibleRange: vi.fn(),
  crosshair: undefined as undefined | ((event: { time: string }) => void),
  click: undefined as undefined | ((event: { time: string; hoveredObjectId?: string }) => void),
  clickHandlers: new Set<(event: { time: string; hoveredObjectId?: string }) => void>(),
  setMarkers: vi.fn(),
  markers: vi.fn(() => ({ detach: vi.fn(), setMarkers: chart.setMarkers })),
  seriesOptions: [] as Array<Record<string, unknown>>,
  applyOptions: vi.fn(),
  createPriceLine: vi.fn((options: Record<string, unknown>) => ({ ...options })),
  removePriceLine: vi.fn(),
  seriesApplyOptions: vi.fn<(options: { autoscaleInfoProvider?: AutoscaleInfoProvider }) => void>(),
  attachPrimitive: vi.fn(),
  detachPrimitive: vi.fn(),
}));

vi.mock('lightweight-charts', () => ({
  CrosshairMode: { Normal: 0 },
  LineSeries: {},
  createSeriesMarkers: chart.markers,
  createChart: () => ({
    addSeries: (_: unknown, options: Record<string, unknown>) => {
      chart.seriesOptions.push(options);
      return { setData: chart.setData, createPriceLine: chart.createPriceLine,
        removePriceLine: chart.removePriceLine, applyOptions: chart.seriesApplyOptions,
        attachPrimitive: chart.attachPrimitive, detachPrimitive: chart.detachPrimitive };
    },
    applyOptions: chart.applyOptions,
    removeSeries: vi.fn(),
    timeScale: () => ({
      setVisibleRange: chart.setVisibleRange,
      getVisibleRange: () => null,
      getVisibleLogicalRange: () => null,
      setVisibleLogicalRange: vi.fn(),
      subscribeVisibleTimeRangeChange: vi.fn(),
      unsubscribeVisibleTimeRangeChange: vi.fn(),
    }),
    subscribeCrosshairMove: (handler: typeof chart.crosshair) => { chart.crosshair = handler; },
    subscribeClick: (handler: NonNullable<typeof chart.click>) => {
      chart.clickHandlers.add(handler);
      chart.click = (event) => chart.clickHandlers.forEach((callback) => callback(event));
    },
    unsubscribeCrosshairMove: vi.fn(),
    unsubscribeClick: (handler: NonNullable<typeof chart.click>) => chart.clickHandlers.delete(handler),
    remove: vi.fn(),
  }),
}));

const update = (callback: () => void) => act(async () => {
  callback();
  await Promise.resolve();
});

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  chart.seriesOptions = [];
  chart.clickHandlers.clear();
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
  it('买卖点挂到净值序列，点击打开精确成交详情，关闭不重置窗口且作用域切换清理详情', async () => {
    const history = fundNavHistorySchema.parse([{ version: 3, symbol: '000001.OF', navDate: '2026-11-02T00:00:00Z', unitNav: 1.2, provider: 'fixture', fetchedAt: '2026-11-03T00:00:00Z', freshness: 'delayed' }]);
    const id = 'fund-trade:2026-11-02:buy';
    const trades: FundNavTrades = {
      enabled: true, scope: 'account-a', loading: false, error: false, unavailable: false, notice: '', retry: vi.fn(),
      position: { symbol: '000001.OF', accountId: 'a', accountName: '当前基金账户', mode: 'actual', asset: { name: '基金名称' } },
      groups: [{ id, date: '2026-11-02', side: 'buy', trades: [{ id: 'b1', eventId: 'e1', factId: 'f1', side: 'buy', tradingDate: '2026-11-02', occurredAt: '2026-11-02T00:00:00Z', timePrecision: 'DATE', currency: 'CNY', quantity: '9007199254740993.000000000001', price: '0.000000000000001' }] }],
    };
    await update(() => root.render(<FundNavHistoryChart history={history} trades={trades} />));
    expect(chart.setMarkers).toHaveBeenLastCalledWith([expect.objectContaining({ id, time: '2026-11-02', shape: 'arrowUp', position: 'belowBar', color: '#c7393c' })]);
    await update(() => document.documentElement.style.setProperty('--color-market-up', '#2f7a66'));
    expect(chart.setMarkers).toHaveBeenLastCalledWith([expect.objectContaining({ color: '#2f7a66' })]);
    document.documentElement.style.removeProperty('--color-market-up');
    const ranges = chart.setVisibleRange.mock.calls.length;
    await update(() => chart.click?.({ time: '2026-11-02' }));
    expect(container.textContent).toContain('已锁定 2026-11-02');
    await update(() => chart.click?.({ time: '2026-11-02', hoveredObjectId: id }));
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('成交详情');
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('9007199254740993.000000000001');
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('0.000000000000001 CNY');
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('按日记录');
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('当前基金账户');
    expect(container.textContent).not.toContain('已锁定');
    await update(() => document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(chart.setVisibleRange.mock.calls.length).toBe(ranges);
    await update(() => chart.click?.({ time: '2026-11-02' }));
    expect(container.textContent).toContain('已锁定 2026-11-02');
    await update(() => [...container.querySelectorAll('button')].find((button) => button.textContent === '查看成交记录')!.click());
    await update(() => document.querySelector<HTMLElement>('[aria-label="净值图成交记录"] [role="menuitem"]')!.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).not.toContain('已锁定');
    const resources = chart.markers.mock.results[0]!.value as { detach: () => void };
    await update(() => root.render(<FundNavHistoryChart history={history} trades={{ ...trades, scope: 'account-b', groups: [] }} />));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(resources.detach).toHaveBeenCalled();
  });
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
    expect(chart.setVisibleRange).toHaveBeenLastCalledWith({ from: '2026-10-04', to: '2026-11-04' });
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
    expect(chart.setVisibleRange).toHaveBeenLastCalledWith({ from: '2026-06-02', to: '2026-07-02' });
    act(() => chart.crosshair?.({ time: '2026-07-01' }));
    expect(container.textContent).toContain('悬停 2026-07-01');
    expect(container.textContent).toContain('单位净值 1.1111');
    act(() => chart.click?.({ time: '2026-07-01' }));
    expect(container.textContent).toContain('已锁定 2026-07-01');
    expect(history[0]?.navDate).toBe('2026-07-01' + suffix);
  });
});

describe('基金成本与净值测量', () => {
  const history = fundNavHistorySchema.parse([1, 1.1, 1.2].map((unitNav, index) => ({
    version: 3, symbol: '000001.OF', navDate: `2026-11-0${2 + index * 2}T00:00:00Z`, unitNav,
    provider: 'fixture', fetchedAt: '2026-11-08T00:00:00Z', freshness: 'delayed',
  })));
  const position = { symbol: '000001.OF', accountId: 'account-a', mode: 'actual' as const,
    currency: 'CNY' as const, quantity: 90, costPrice: 1.8, asset: { name: '验证基金', assetType: 'fund' as const } };
  const click = async (label: string) => update(() => {
    [...container.querySelectorAll('button')].find((button) => button.textContent === label)!.click();
  });
  it('成本默认关闭，开启后右轴包含范围外成本且关闭释放参考', async () => {
    await update(() => root.render(<FundNavHistoryChart history={history} position={position} />));
    expect(chart.createPriceLine).not.toHaveBeenCalled();
    await click('成本参考');
    expect(chart.createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 1.8, title: '持仓单位成本' }));
    const scale = chart.seriesApplyOptions.mock.calls.at(-1)![0].autoscaleInfoProvider as AutoscaleInfoProvider;
    expect(scale(() => ({ priceRange: { minValue: 1, maxValue: 1.2 } }))?.priceRange).toEqual({ minValue: 1, maxValue: 1.8 });
    expect(chart.applyOptions).toHaveBeenCalledWith({ rightPriceScale: { autoScale: true } });
    await click('成本参考');
    expect(chart.removePriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 1.8 }));
    const normal = chart.seriesApplyOptions.mock.calls.at(-1)![0].autoscaleInfoProvider as AutoscaleInfoProvider;
    expect(normal(() => ({ priceRange: { minValue: 1, maxValue: 1.2 } }))?.priceRange).toEqual({ minValue: 1, maxValue: 1.2 });
  });
  it('测量使用正式净值，缺日期不产生结果，关闭测量释放蒙层资源', async () => {
    await update(() => root.render(<FundNavHistoryChart history={history} position={position} />));
    await click('区间测量');
    await update(() => chart.click?.({ time: '2026-11-03' }));
    expect(container.textContent).toContain('所选日期没有正式净值');
    await update(() => chart.click?.({ time: '2026-11-02' }));
    await update(() => chart.click?.({ time: '2026-11-06' }));
    const text = container.querySelector('[aria-label="净值区间测量结果"]')!.textContent;
    expect(text).toContain('+20%');
    expect(text).toContain('3 条净值记录');
    expect(chart.attachPrimitive).toHaveBeenCalledOnce();
    await click('区间测量');
    expect(chart.detachPrimitive).toHaveBeenCalledWith(chart.attachPrimitive.mock.calls[0]![0]);
    expect(container.querySelector('[aria-label="净值区间测量结果"]')).toBeNull();
  });
  it('选点和完成后都可点击取消，取消隐藏提示及结果，Esc也可清除已完成测量', async () => {
    await update(() => root.render(<FundNavHistoryChart history={history} position={position} />));
    const button = () => [...container.querySelectorAll('button')].find((item) => item.textContent === '区间测量')!;
    const expectHidden = () => {
      expect(button().getAttribute('aria-pressed')).toBe('false');
      expect(container.textContent).not.toContain('请选择净值区间');
      expect(container.textContent).not.toContain('所选日期没有正式净值');
      expect(container.querySelector('[aria-label="净值区间测量结果"]')).toBeNull();
    };
    await click('区间测量');
    await click('区间测量');
    expectHidden();
    await click('区间测量');
    await update(() => chart.click?.({ time: '2026-11-03' }));
    await click('区间测量');
    expectHidden();
    await click('区间测量');
    await update(() => chart.click?.({ time: '2026-11-02' }));
    await click('区间测量');
    expectHidden();
    for (const cancel of ['button', 'escape']) {
      await click('区间测量');
      await update(() => chart.click?.({ time: '2026-11-02' }));
      await update(() => chart.click?.({ time: '2026-11-06' }));
      expect(button().getAttribute('aria-pressed')).toBe('true');
      expect(container.textContent).not.toContain('请选择净值区间');
      if (cancel === 'button') await click('区间测量');
      else await update(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      expectHidden();
    }
  });
  it('Esc只取消正在测量，切换账户和模式清理旧参考', async () => {
    await update(() => root.render(<FundNavHistoryChart history={history} position={position} />));
    await click('成本参考');
    await click('区间测量');
    await update(() => chart.click?.({ time: '2026-11-02' }));
    const parent = vi.fn();
    window.addEventListener('keydown', parent);
    await update(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(parent).not.toHaveBeenCalled();
    window.removeEventListener('keydown', parent);
    expect(container.textContent).not.toContain('请选择净值区间终点');
    expect([...container.querySelectorAll('button')].find((button) => button.textContent === '成本参考')?.getAttribute('aria-pressed')).toBe('true');
    await update(() => root.render(<FundNavHistoryChart history={history} position={{ ...position, accountId: 'account-b', mode: 'shadow' }} />));
    expect([...container.querySelectorAll('button')].find((button) => button.textContent === '成本参考')?.getAttribute('aria-pressed')).toBe('false');
    expect(chart.removePriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 1.8 }));
  });
});
