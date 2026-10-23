import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { exampleChartWindow } from '../../src/features/settings/chart-preview-data';
import {
  chartDocument,
  chartUpdateScript,
  type ChartColors,
  type ChartData,
  type ChartMessage,
} from '../../src/platform/charts/chart-document';

const colors: ChartColors = {
  background: '#fff',
  text: '#000',
  up: '#080',
  down: '#f00',
  line: '#00f',
};
const dataWindow = (first: number, last: number): ChartData => ({
  candles: Array.from({ length: last - first + 1 }, (_, index) => ({
    time: `2026-01-${String(first + index).padStart(2, '0')}`,
    open: 10,
    high: 12,
    low: 9,
    close: 11,
  })),
  lines: [],
});

function runtime(initial: ChartData, autoLayout = true, deferPaint = false) {
  type Range = { from: number; to: number };
  let range: Range | null = null;
  let rangeChanged: ((value: Range | null) => void) | undefined;
  const events = new Map<string, (event?: { buttons: number }) => void>();
  const lifecycle = new Map<string, () => void>();
  const messages: ChartMessage[] = [];
  const frames = new Map<number, () => void>();
  let frameId = 0;
  let resized:
    ((entries: Array<{ contentRect: { width: number; height: number } }>) => void) | undefined;
  const disconnect = vi.fn();
  const root = {
    clientWidth: 0,
    clientHeight: 0,
    addEventListener: (name: string, callback: (event?: { buttons: number }) => void) =>
      events.set(name, callback),
  };
  const resize = (width: number, height: number) => {
    root.clientWidth = width;
    root.clientHeight = height;
    resized?.([{ contentRect: { width, height } }]);
  };
  const renderFrame = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback());
  };
  const series: Array<{
    data: Array<{ time: string }>;
    setData: ReturnType<typeof vi.fn>;
    applyOptions: ReturnType<typeof vi.fn>;
  }> = [];
  const scale = {
    getVisibleLogicalRange: () => range && { ...range },
    setVisibleLogicalRange: vi.fn((next: Range) => {
      const apply = () => {
        range = { ...next };
        rangeChanged?.(range);
      };
      if (deferPaint) frames.set(++frameId, apply);
      else apply();
    }),
    subscribeVisibleLogicalRangeChange: (callback: typeof rangeChanged) => {
      rangeChanged = callback;
    },
    fitContent: vi.fn(() => {
      const apply = () => {
        const count = series[0]?.data.length ?? 0;
        range = count ? { from: 0, to: count - 1 } : null;
        rangeChanged?.(range);
      };
      if (deferPaint) frames.set(++frameId, apply);
      else apply();
    }),
  };
  const chart = {
    timeScale: () => scale,
    applyOptions: vi.fn(),
    remove: vi.fn(),
    addSeries: vi.fn(() => {
      const item = { data: [] as Array<{ time: string }>, setData: vi.fn(), applyOptions: vi.fn() };
      item.setData.mockImplementation((points: Array<{ time: string }>) => {
        item.data = points.map((point) => ({ ...point }));
        if (deferPaint && range === null) range = { from: -40, to: points.length - 1 };
        if (range) rangeChanged?.(range);
      });
      series.push(item);
      return item;
    }),
    removeSeries: vi.fn((item: (typeof series)[number]) => {
      series.splice(series.indexOf(item), 1);
    }),
  };
  const createChart = vi.fn(() => chart);
  const web: Record<string, unknown> = {
    ReactNativeWebView: {
      postMessage: (raw: string) => messages.push(JSON.parse(raw) as ChartMessage),
    },
    addEventListener: (name: string, callback: () => void) => lifecycle.set(name, callback),
  };
  const context = createContext({
    window: web,
    document: { getElementById: () => root },
    ResizeObserver: class {
      constructor(callback: typeof resized) {
        resized = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
    requestAnimationFrame: (callback: () => void) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    LightweightCharts: { createChart, CandlestickSeries: 'candles', LineSeries: 'line' },
  });
  const html = chartDocument('', 'chart-test', initial, colors, true);
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)![1];
  runInContext(script, context);
  if (autoLayout) {
    resize(390, 320);
    renderFrame();
    renderFrame();
  }
  return {
    chart,
    scale,
    series,
    messages,
    createChart,
    web,
    resize,
    renderFrame,
    disconnect,
    range: () => range,
    visible: (next: Range) => scale.setVisibleLogicalRange(next),
    fire: (name: string) => events.get(name)?.({ buttons: 1 }),
    leave: () => lifecycle.get('pagehide')?.(),
    update: (data: ChartData, nextColors = colors, id = 'chart-test') =>
      runInContext(chartUpdateScript(id, data, nextColors, true), context),
  };
}

describe('本地图表窗口增量更新', () => {
  it('拟合操作异步绘制时，先完成绘制再报告就绪，原生首次回传保留完整三点视口', () => {
    const data: ChartData = { ...dataWindow(1, 3), main: 'line' };
    const view = runtime(data, false, true);
    view.resize(390, 320);
    view.renderFrame();
    expect(view.messages.filter((message) => message.kind === 'ready')).toHaveLength(0);
    view.renderFrame();
    expect(view.range()).toEqual({ from: 0, to: 2 });
    expect(view.messages.filter((message) => message.kind === 'ready')).toHaveLength(1);
    view.update(structuredClone(data));
    view.renderFrame();
    expect(view.range()).toEqual({ from: 0, to: 2 });
  });

  it('零尺寸时不拟合或报告就绪，首次有效布局拟合最新数据，后续布局保留用户视口', () => {
    const view = runtime(dataWindow(1, 3), false);
    expect(view.scale.fitContent).not.toHaveBeenCalled();
    expect(view.messages).toHaveLength(0);
    view.resize(0, 320);
    view.renderFrame();
    expect(view.scale.fitContent).not.toHaveBeenCalled();
    view.update(dataWindow(1, 7));
    expect(view.scale.fitContent).not.toHaveBeenCalled();
    view.resize(390, 320);
    expect(view.scale.fitContent).not.toHaveBeenCalled();
    view.renderFrame();
    expect(view.range()).toEqual({ from: 0, to: 6 });
    expect(view.messages.filter((message) => message.kind === 'ready')).toHaveLength(0);
    view.renderFrame();
    expect(view.messages.filter((message) => message.kind === 'ready')).toHaveLength(1);
    view.visible({ from: 2, to: 4 });
    view.resize(780, 200);
    view.renderFrame();
    expect(view.range()).toEqual({ from: 2, to: 4 });
    expect(view.scale.fitContent).toHaveBeenCalledOnce();
  });

  it('首帧拟合前离页会停止观察和待执行帧，不再发送就绪或访问已释放图表', () => {
    const view = runtime(dataWindow(1, 3), false);
    view.resize(390, 320);
    view.leave();
    view.renderFrame();
    expect(view.disconnect).toHaveBeenCalledOnce();
    expect(view.scale.fitContent).not.toHaveBeenCalled();
    expect(view.messages).toHaveLength(0);
    expect(view.chart.remove).toHaveBeenCalledOnce();
  });

  it('示例扩窗只增加更早日期，重叠蜡烛和指标数值保持不变', () => {
    const previous = exampleChartWindow(30);
    const next = exampleChartWindow(40);
    expect(next.candles[0].time < previous.candles[0].time).toBe(true);
    expect(next.candles.slice(-30)).toEqual(previous.candles);
    expect(next.lines[0].values.slice(-30)).toEqual(previous.lines[0].values);
  });

  it('前插历史和追加日期均保留可视日期与缩放宽度，不重建图表', () => {
    const view = runtime(dataWindow(3, 6));
    view.visible({ from: 0.5, to: 2.5 });
    view.update(dataWindow(1, 6));
    expect(view.range()).toEqual({ from: 2.5, to: 4.5 });
    view.update(dataWindow(1, 7));
    expect(view.range()).toEqual({ from: 2.5, to: 4.5 });
    expect(view.scale.fitContent).toHaveBeenCalledOnce();
    expect(view.createChart).toHaveBeenCalledOnce();
    expect(view.messages.filter((message) => message.kind === 'ready')).toHaveLength(1);
    expect(view.chart.remove).not.toHaveBeenCalled();
  });

  it('增量配色和指标数量生效，其他实例和超限数据不能进入当前图表', () => {
    const initial = dataWindow(3, 6);
    initial.lines = ['一', '二'].map((name) => ({
      name,
      values: [{ time: '2026-01-03', value: 10 }],
    }));
    const view = runtime(initial);
    const dark = { ...colors, background: '#111', up: '#f00' };
    view.update(dataWindow(1, 6), dark);
    expect(view.series).toHaveLength(1);
    expect(view.chart.removeSeries).toHaveBeenCalledTimes(2);
    expect(view.chart.applyOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ layout: { background: { color: '#111' }, textColor: '#000' } }),
    );
    const calls = view.series[0].setData.mock.calls.length;
    view.update(dataWindow(1, 7), colors, 'other-chart');
    expect(view.series[0].setData).toHaveBeenCalledTimes(calls);
    expect(() =>
      chartUpdateScript(
        'chart-test',
        { candles: Array(3001).fill(initial.candles[0]), lines: [] },
        colors,
      ),
    ).toThrow('上限');
  });

  it('扩窗不打断手势结束，程序更新及离页不会额外申请历史', () => {
    const view = runtime(dataWindow(3, 6));
    view.fire('touchstart');
    view.fire('pointerdown');
    view.visible({ from: 1, to: 2 });
    expect(view.messages.filter((message) => message.kind === 'older')).toHaveLength(1);
    view.update(dataWindow(1, 6));
    view.fire('touchmove');
    view.fire('pointerup');
    view.fire('touchend');
    view.visible({ from: 0, to: 1 });
    expect(view.messages.filter((message) => message.kind === 'touch')).toHaveLength(1);
    expect(view.messages.filter((message) => message.kind === 'end')).toHaveLength(1);
    expect(view.messages.filter((message) => message.kind === 'older')).toHaveLength(1);
    view.leave();
    expect(view.chart.remove).toHaveBeenCalledOnce();
    expect(view.web.__THESIS_LEDGER_CHART_UPDATE__).toBeUndefined();
    const calls = view.series[0].setData.mock.calls.length;
    view.update(dataWindow(1, 7));
    expect(view.series[0].setData).toHaveBeenCalledTimes(calls);
  });
});
