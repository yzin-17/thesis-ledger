// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrategyBacktestEquityChart } from '../src/features/strategy/StrategyBacktestEquityChart';
import { buildBacktestChartModel } from '../src/features/strategy/strategy-backtest-chart.model';
import { unifiedRatioCases, unifiedRatioJob } from './unified-backtest-ratio-samples';

const capture = vi.hoisted(() => ({
  series: [] as { applyOptions: ReturnType<typeof vi.fn>; setData: ReturnType<typeof vi.fn> }[],
  remove: vi.fn(),
  setCrosshair: vi.fn(),
  clearCrosshair: vi.fn(),
  fit: vi.fn(),
}));
vi.mock('lightweight-charts', () => ({
  CrosshairMode: { Normal: 0 },
  LineSeries: {},
  createChart: () => ({
    addSeries: () => {
      const series = { applyOptions: vi.fn(), setData: vi.fn() };
      capture.series.push(series);
      return series;
    },
    panes: () => [{ setStretchFactor: vi.fn() }, { setStretchFactor: vi.fn() }],
    timeScale: () => ({
      fitContent: capture.fit,
      getVisibleRange: () => null,
      subscribeVisibleTimeRangeChange: vi.fn(),
      unsubscribeVisibleTimeRangeChange: vi.fn(),
    }),
    subscribeCrosshairMove: vi.fn(),
    subscribeClick: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    unsubscribeClick: vi.fn(),
    applyOptions: vi.fn(),
    remove: capture.remove,
    setCrosshairPosition: capture.setCrosshair,
    clearCrosshairPosition: capture.clearCrosshair,
  }),
}));
let root: Root | undefined;
let host: HTMLDivElement;
beforeEach(() => {
  capture.series.length = 0;
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host.remove();
});

describe('实际图表的回撤格式和焦点', () => {
  it.each(unifiedRatioCases)('$name 的轴与读数一致', async ({ value, chart, chartExpected }) => {
    const job = unifiedRatioJob(value, chart),
      model = buildBacktestChartModel(job, job.result!),
      before = JSON.stringify(model);
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <StrategyBacktestEquityChart model={model} resetKey="ratio" onRangeChange={() => {}} />,
      ),
    );
    const options = capture.series[1]!.applyOptions.mock.calls.at(-1)![0] as {
      priceFormat: { formatter: (value: number) => string };
    };
    expect(options.priceFormat.formatter(chart)).toBe(chartExpected);
    expect(
      capture.series[1]!.setData.mock.calls.at(-1)![0].map((p: { value: number }) => p.value),
    ).toEqual([chart, chart, chart]);
    const region = host.querySelector('[role="region"]')!;
    await act(async () => {
      region.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(host.querySelector('[role="status"]')!.textContent).toContain('回撤：' + chartExpected);
    expect(host.querySelector('[role="status"]')!.textContent).toContain('已锁定');
    expect(capture.setCrosshair).toHaveBeenCalled();
    await act(async () => {
      region.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(capture.clearCrosshair).toHaveBeenCalled();
    expect(JSON.stringify(model)).toBe(before);
  });
});
