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
  visibleRange: null as { from: number; to: number } | null,
  setVisibleRange: vi.fn(),
  markerAttach: vi.fn(),
  setMarkers: vi.fn(),
  detachMarkers: vi.fn(),
  subscribeClick: vi.fn(),
  subscribeHover: vi.fn(),
}));
vi.mock('lightweight-charts', () => ({
  CrosshairMode: { Normal: 0 },
  LineSeries: {},
  createSeriesMarkers: (...args: unknown[]) => {
    capture.markerAttach(...args);
    return { setMarkers: capture.setMarkers, detach: capture.detachMarkers };
  },
  createChart: () => ({
    addSeries: () => {
      const series = { applyOptions: vi.fn(), setData: vi.fn() };
      capture.series.push(series);
      return series;
    },
    panes: () => [{ setStretchFactor: vi.fn() }, { setStretchFactor: vi.fn() }],
    timeScale: () => ({
      fitContent: capture.fit,
      getVisibleRange: () => capture.visibleRange,
      setVisibleRange: capture.setVisibleRange,
      subscribeVisibleTimeRangeChange: vi.fn(),
      unsubscribeVisibleTimeRangeChange: vi.fn(),
    }),
    subscribeCrosshairMove: capture.subscribeHover,
    subscribeClick: capture.subscribeClick,
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
  vi.stubGlobal('PointerEvent', MouseEvent);
  capture.series.length = 0;
  capture.visibleRange = null;
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
  document.documentElement.style.removeProperty('--color-market-up');
  document.documentElement.style.removeProperty('--color-market-down');
  vi.unstubAllGlobals();
});

describe('回测图表成交标记与原交互', () => {
  it('独立展示标的价格，键盘时点显示原值，刷新保留曲线和窗口', async () => {
    const job = unifiedRatioJob('0.1');
    job.snapshotId = 'chart-snapshot';
    const base = buildBacktestChartModel(job, job.result!);
    const model = buildBacktestChartModel(job, job.result!, { schemaVersion: '1', runId: job.id, status: 'available',
      source: { symbol: 'AAPL.US', currency: 'USD', adjustment: 'hfq', timeframe: '1d', timezone: 'America/New_York', providerId: 'fixture', upstreamSource: 'fixture', snapshotId: 'chart-snapshot', artifactHash: 'hash', dataAsOf: '2026-11-11T08:00:00Z' },
      points: base.equity.map((point) => ({ occurredAt: point.timestamp, close: '100.1234567890123' })),
    });
    root = createRoot(host);
    await act(async () => root!.render(<StrategyBacktestEquityChart model={base} resetKey={job.id} onRangeChange={() => {}} />));
    capture.visibleRange = { from: base.equity[0]!.time / 1000, to: base.equity.at(-1)!.time / 1000 };
    await act(async () => root!.render(<StrategyBacktestEquityChart model={model} resetKey={job.id} onRangeChange={() => {}} />));
    expect(capture.setVisibleRange).toHaveBeenLastCalledWith(capture.visibleRange);
    expect(capture.series[2]!.setData.mock.calls.at(-1)![0]).toEqual(base.equity.map((point) => ({ time: point.time / 1000, value: 100.1234567890123 })));
    expect(capture.series[2]!.applyOptions.mock.calls.at(-1)![0].color).toBe('#8b5cf6');
    expect(capture.series[0]!.setData.mock.calls.at(-1)![0]).toEqual(base.equity.map((point) => ({ time: point.time / 1000, value: point.value })));
    expect(host.textContent).toContain('AAPL.US 收盘价 USD（后复权 · 左轴）');
    await act(async () => host.querySelector('[role="region"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(host.querySelector('[role="status"]')!.textContent).toContain('标的收盘价：100.123457 USD');
    await act(async () => root!.render(<StrategyBacktestEquityChart model={model} resetKey={job.id} onRangeChange={() => {}} instrumentRequest={{ data: undefined, fetching: true, error: false }} />));
    expect(host.querySelectorAll('[data-slot="list-refresh"]')).toHaveLength(1);
    expect(capture.fit).toHaveBeenCalledTimes(1);
    expect(capture.series[0]!.setData.mock.calls.at(-1)![0]).toHaveLength(base.equity.length);
  });
  it('绘制聚合买卖箭头，点击读数保留原时间与六位精度，配色更新不重置窗口', async () => {
    const job = unifiedRatioJob('0.1');
    job.result!.priceResearch = { protocolVersion: 'price-research-v1' };
    job.result!.simulationFills = Array.from({ length: 5 }, (_, index) => ({
      fillId: `fill-${index}`, occurredAt: '2026-11-01T06:00:00Z',
      side: index === 4 ? 'sell' : 'buy', executionSymbol: 'AAPL.US',
      quantity: '0.1234567890123456789', price: '12.1234567890123456789',
    }));
    job.snapshotId = 'marker-snapshot';
    const base = buildBacktestChartModel(job, job.result!);
    const model = buildBacktestChartModel(job, job.result!, { schemaVersion: '1', runId: job.id, status: 'available',
      source: { symbol: 'AAPL.US', currency: 'USD', adjustment: 'hfq', timeframe: '1d', timezone: 'America/New_York', providerId: 'fixture', upstreamSource: 'fixture', snapshotId: 'marker-snapshot', artifactHash: 'hash', dataAsOf: '2026-11-11T08:00:00Z' },
      points: base.equity.map((point) => ({ occurredAt: point.timestamp, close: '12.1234567890123456789' })),
    }), before = JSON.stringify(model);
    root = createRoot(host);
    await act(async () => root!.render(<StrategyBacktestEquityChart model={model} resetKey={job.id} onRangeChange={() => {}} />));
    expect(capture.markerAttach).toHaveBeenCalledWith(capture.series[2], [], { autoScale: true });
    expect(capture.setMarkers.mock.calls.at(-1)![0]).toMatchObject([
      { shape: 'arrowUp', position: 'belowBar', text: '买 4笔', time: model.equity[0]!.time / 1000 },
      { shape: 'arrowDown', position: 'aboveBar', text: '卖', time: model.equity[0]!.time / 1000 },
    ]);
    const markerEvent = { time: model.equity.at(-1)!.time / 1000, hoveredObjectId: model.tradeMarkers[0]!.id };
    await act(async () => capture.subscribeHover.mock.calls[0]![0](markerEvent));
    expect(host.querySelector('[role="status"]')!.textContent).toContain('模拟买入');
    expect(host.querySelector('[role="status"]')!.textContent).not.toContain('已锁定');
    await act(async () => capture.subscribeClick.mock.calls[0]![0](markerEvent));
    expect(capture.setCrosshair).toHaveBeenLastCalledWith(Number('12.1234567890123456789'), model.tradeMarkers[0]!.time / 1000, capture.series[2]);
    const readout = host.querySelector('[role="status"]')!;
    expect(readout.textContent).toContain('模拟买入');
    expect(readout.textContent).toContain('2026/11/01 06:00');
    expect(readout.textContent).toContain('研究单位 0.123457');
    expect(readout.textContent).toContain('后复权价 12.123457');
    expect(readout.textContent).toContain('其余 2 笔');
    const visibility = host.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="显示买卖点"]')!;
    expect(visibility.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).not.toContain('↑ 模拟买入');
    expect(host.textContent).not.toContain('↓ 模拟卖出');
    await act(async () => visibility.click());
    expect(visibility.getAttribute('aria-checked')).toBe('false');
    expect(capture.setMarkers.mock.calls.at(-1)![0]).toEqual([]);
    expect(readout.textContent).not.toContain('模拟买入');
    expect(readout.textContent).toContain('已锁定');
    expect(capture.fit).toHaveBeenCalledTimes(1);
    await act(async () => visibility.click());
    expect(capture.setMarkers.mock.calls.at(-1)![0]).toHaveLength(2);
    expect(readout.textContent).toContain('研究单位 0.123457');
    await act(async () => {
      document.documentElement.style.setProperty('--color-market-up', '#00ff00');
      document.documentElement.style.setProperty('--color-market-down', '#ff0000');
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(capture.setMarkers.mock.calls.at(-1)![0]).toMatchObject([{ color: '#00ff00' }, { color: '#ff0000' }]);
    expect(capture.fit).toHaveBeenCalledTimes(1);
    expect(capture.markerAttach).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(model)).toBe(before);
    const missing = buildBacktestChartModel(job, job.result!, { schemaVersion: '1', runId: job.id, status: 'available',
      source: { symbol: 'AAPL.US', currency: 'USD', adjustment: 'hfq', timeframe: '1d', timezone: 'America/New_York', providerId: 'fixture', upstreamSource: 'fixture', snapshotId: 'marker-snapshot', artifactHash: 'hash', dataAsOf: '2026-11-11T08:00:00Z' },
      points: base.equity.map((point) => ({ occurredAt: point.timestamp, close: null })),
    });
    expect(missing.tradeMarkers).toEqual([]);
    expect(missing.unmappedFillCount).toBe(5);
    const empty = { ...model, tradeMarkers: [] };
    await act(async () => root!.render(<StrategyBacktestEquityChart model={empty} resetKey="next-job" onRangeChange={() => {}} />));
    expect(capture.setMarkers.mock.calls.at(-1)![0]).toEqual([]);
    expect(host.textContent).not.toContain('模拟买入');
    expect(visibility.disabled).toBe(true);
    expect(host.querySelector('[role="status"]')).toBeNull();
    await act(async () => root!.unmount());
    root = undefined;
    expect(capture.detachMarkers).toHaveBeenCalledTimes(1);
    expect(capture.detachMarkers.mock.invocationCallOrder[0]).toBeLessThan(capture.remove.mock.invocationCallOrder[0]!);
  });
});

describe('实际图表的回撤格式和焦点', () => {
  it('空数据恢复时创建图表，清空后释放实例，同一任务再次恢复仍重新绘制', async () => {
    const job = unifiedRatioJob('0.1');
    const model = buildBacktestChartModel(job, job.result!);
    const empty = { ...model, equity: [], drawdown: [] };
    root = createRoot(host);
    const render = async (next: typeof model) => {
      await act(async () => root!.render(
        <StrategyBacktestEquityChart model={next} resetKey="same-task" onRangeChange={() => {}} />,
      ));
    };
    await render(empty);
    expect(capture.series).toHaveLength(0);
    await render(model);
    expect(capture.series).toHaveLength(3);
    expect(capture.series[0]!.setData.mock.calls.at(-1)![0]).toHaveLength(3);
    await render(empty);
    expect(capture.remove).toHaveBeenCalledTimes(1);
    expect(capture.detachMarkers).toHaveBeenCalledTimes(1);
    await render(model);
    expect(capture.series).toHaveLength(6);
    expect(capture.series[3]!.setData.mock.calls.at(-1)![0]).toHaveLength(3);
    expect(capture.fit).toHaveBeenCalledTimes(2);
  });

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
