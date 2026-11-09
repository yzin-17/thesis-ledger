import { expect, it, vi } from 'vitest';
import type { MouseEventParams, Time } from 'lightweight-charts';
import { createArenaMarkerPrimitive } from './market-arena-marker-primitive.js';

function fixture() {
  const points = [
    { id: 'p1', model: '模型甲', side: 'buy' as const },
    { id: 'p2', model: '模型乙', side: 'buy' as const },
    { id: 'p3', model: '模型丙', side: 'sell' as const },
  ].map(point => ({ ...point, arenaId: 'a1', roundId: 'r1', entrantId: point.id, symbol: '600036.SH', day: '2026-11-04', key: '2026-11-06', executedAt: '2026-11-04T01:30:00Z', price: '10.123456', quantity: '100' }));
  const primitive = createArenaMarkerPrimitive(points, { buy: '#c7393c', sell: '#2f7a66', background: '#fff', foreground: '#111', border: '#ddd', font: 'sans-serif' });
  let move: ((event: MouseEventParams<Time>) => void) | undefined;
  let offset = 0;
  let spacing = 12;
  const time = { timeToCoordinate: vi.fn(() => 100 + offset), timeToIndex: () => 0, options: () => ({ barSpacing: spacing }) };
  const chart = { timeScale: () => time, options: () => ({ layout: { fontSize: 12 } }),
    subscribeCrosshairMove: vi.fn((handler: typeof move) => { move = handler; }), unsubscribeCrosshairMove: vi.fn() };
  const series = { getPane: () => ({ paneIndex: () => 0, getHeight: () => 200 }), dataByIndex: () => ({ time: '2026-11-06', high: 20, low: 10 }),
    priceToCoordinate: (price: number): number => price === 10 ? 120 : 40 };
  const update = vi.fn();
  primitive.attached?.({ chart, series, requestUpdate: update } as never); primitive.updateAllViews?.();
  const strokes: string[] = [];
  const context = { save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn<(x: number, y: number) => void>(), lineTo: vi.fn<(x: number, y: number) => void>(),
    strokeStyle: '', stroke: vi.fn(() => { strokes.push(context.strokeStyle); }), roundRect: vi.fn(), fill: vi.fn(), fillText: vi.fn<(text: string, x: number, y: number) => void>(),
    measureText: (text: string) => ({ width: text.length * 6 }) };
  const draw = (width = 400) => primitive.paneViews?.()[0]?.renderer()?.draw({
    useMediaCoordinateSpace: (run: (value: unknown) => void) => run({ context, mediaSize: { width, height: 200 } }),
  } as never);
  return { primitive, chart, series, update, context, strokes, draw, time, hover: (point?: { x: number; y: number }, paneIndex = 0) => {
    move?.({ point, paneIndex } as MouseEventParams<Time>); primitive.updateAllViews?.();
  }, pan: () => { offset = 20; primitive.updateAllViews?.(); }, zoom: (value: number) => { spacing = value; primitive.updateAllViews?.(); } };
}

it('模拟买卖使用主题颜色的空心箭头，同桶同方向合并且不常驻模型名', () => {
  const f = fixture(); f.draw();
  expect(f.context.setLineDash).toHaveBeenCalledWith([]);
  expect(f.strokes).toEqual(['#c7393c', '#2f7a66']);
  expect(f.context.closePath).toHaveBeenCalledTimes(2);
  expect(f.context.fill).not.toHaveBeenCalled();
  expect(f.context.moveTo).toHaveBeenCalledWith(100, 124);
  expect(f.context.moveTo).toHaveBeenCalledWith(100, 18);
  expect(f.context.fillText.mock.calls.map(call => call[0])).toEqual(['买（模）', '卖（模）']);
  expect(f.time.timeToCoordinate).toHaveBeenCalledWith('2026-11-06');
  expect(f.primitive.hitTest?.(100, 130)?.externalId).toBe('arena:2026-11-06:buy');
  f.primitive.detached?.();
});
it('悬浮显示同桶两模型与原始事实日期/价格，离开和切换副图后隐藏', () => {
  const f = fixture(); f.hover({ x: 100, y: 130 }); f.draw();
  expect(f.context.fillText).toHaveBeenCalledWith('模型甲', expect.any(Number), expect.any(Number));
  expect(f.context.fillText).toHaveBeenCalledWith('模型乙', expect.any(Number), expect.any(Number));
  expect(f.context.fillText).toHaveBeenCalledWith('2026-11-04 · 模拟买入 100 股 × 10.123456', expect.any(Number), expect.any(Number));
  f.context.fillText.mockClear(); f.hover(undefined); f.draw();
  expect(f.context.fillText.mock.calls.map(call => call[0])).toEqual(['买（模）', '卖（模）']);
  f.context.fillText.mockClear(); f.hover({ x: 100, y: 130 }, 1); f.draw();
  expect(f.context.fillText.mock.calls.map(call => call[0])).toEqual(['买（模）', '卖（模）']);
  f.primitive.detached?.(); expect(f.chart.unsubscribeCrosshairMove).toHaveBeenCalledOnce();
});
it('平移刷新坐标和命中区域，同时清除旧位置的悬浮提示', () => {
  const f = fixture(); f.hover({ x: 100, y: 130 }); f.pan(); f.draw();
  expect(f.context.fillText.mock.calls.map(call => call[0])).toEqual(['买（模）', '卖（模）']);
  expect(f.primitive.hitTest?.(100, 130)).toBeNull();
  expect(f.primitive.hitTest?.(120, 130)?.externalId).toBe('arena:2026-11-06:buy');
  f.primitive.detached?.(); expect(f.primitive.hitTest?.(120, 130)).toBeNull();
});
it('价格已移出当前视口时不在边缘制造标记', () => {
  const f = fixture(); f.series.priceToCoordinate = () => -20;
  f.primitive.updateAllViews?.(); f.draw();
  expect(f.context.stroke).not.toHaveBeenCalled();
  expect(f.primitive.hitTest?.(100, 130)).toBeNull();
  f.primitive.detached?.();
});
it('文字在右边缘仍居中置于箭头底部，悬浮可见文字同样可查看模型', () => {
  const f = fixture(); f.draw(107);
  const label = f.context.fillText.mock.calls.find(call => call[0] === '买（模）');
  expect(Number(label?.[1]) + 12).toBe(100);
  expect(label?.[2]).toBeGreaterThan(133);
  expect(f.primitive.hitTest?.(90, Number(label?.[2]))?.externalId).toBe('arena:2026-11-06:buy');
  f.hover({ x: 90, y: Number(label?.[2]) }); f.draw(107);
  expect(f.context.fillText).toHaveBeenCalledWith('模型甲', expect.any(Number), expect.any(Number));
  f.primitive.detached?.();
});
it.each([-8, 2, 398, 408])('箭头横坐标 %i 位于边缘或视口外时，买卖文字始终跟随箭头中心', x => {
  const f = fixture(); f.time.timeToCoordinate.mockReturnValue(x);
  f.primitive.updateAllViews?.(); f.draw();
  for (const text of ['买（模）', '卖（模）']) {
    const label = f.context.fillText.mock.calls.find(call => call[0] === text)!;
    expect(label[1] + f.context.measureText(text).width / 2).toBe(x);
  }
  const label = f.context.fillText.mock.calls.find(call => call[0] === '买（模）')!;
  expect(label[2]).toBeGreaterThan(133);
  expect(f.primitive.hitTest?.(100, label[2])).toBeNull();
  f.primitive.detached?.();
});
it.each([[6, 10], [18, 14], [40, 26]])('间距 %i 的轮廓外尺寸与真实成交标记的 %ipx 一致', (spacing, expected) => {
  const f = fixture(); f.zoom(spacing); f.draw();
  const points = [...f.context.moveTo.mock.calls.slice(0, 1), ...f.context.lineTo.mock.calls.slice(0, 6)];
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  expect(Math.max(...xs) - Math.min(...xs) + 2).toBe(expected);
  expect(Math.max(...ys) - Math.min(...ys) + 2).toBe(expected);
  const edge = f.context.lineTo.mock.calls[0]!;
  expect(f.primitive.hitTest?.(edge[0], edge[1])?.externalId).toBe('arena:2026-11-06:buy');
  f.primitive.detached?.();
});
