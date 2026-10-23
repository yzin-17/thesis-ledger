// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fundNavHistorySchema } from '@thesis-ledger/schemas';
import { FundNavHistoryChart } from './MarketNavChart.js';

const chart = vi.hoisted(() => ({
  setData: vi.fn(),
  setVisibleRange: vi.fn(),
  crosshair: undefined as undefined | ((event: { time: string }) => void),
  click: undefined as undefined | ((event: { time: string }) => void),
}));

vi.mock('lightweight-charts', () => ({
  CrosshairMode: { Normal: 0 },
  LineSeries: {},
  createChart: () => ({
    addSeries: () => ({ setData: chart.setData }),
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
