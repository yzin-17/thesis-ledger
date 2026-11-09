import { describe, expect, it, vi } from 'vitest';
import { buildChartPoints } from './market-chart-model.js';
import { MarketChartViewportController } from './market-chart-viewport-controller.js';
import type { MarketChartBar } from './market-chart-types.js';
const points = (start: number, count: number) => buildChartPoints(Array.from({ length: count }, (_, i): MarketChartBar => ({
  symbol: '510300.SH', timeframe: '1d', timestamp: new Date(Date.UTC(2026, 0, start + i)).toISOString(),
  open: 10, high: 11, low: 9, close: 10, volume: 100, amount: 1000,
})), []);
function fixture() {
  let logical = { from: 0, to: 29 };
  const scale = { getVisibleLogicalRange: () => logical,
    setVisibleRange: vi.fn(), setVisibleLogicalRange: vi.fn((range: { from: number; to: number }) => { logical = { ...range }; }) };
  const chart = { timeScale: () => scale };
  const controller = new MarketChartViewportController();
  const controls = { range: 30, reset: 0, focus: 0 };
  const data = points(1, 30);
  controller.commit(chart, data, 'daily', controls, controller.snapshot(chart));
  scale.setVisibleRange.mockClear(); scale.setVisibleLogicalRange.mockClear();
  return { controller, chart, scale, controls, data, set: (range: typeof logical) => { logical = range; } };
}
describe('原生图表视口生命周期', () => {
  it('缩放独立执行一次，边界事件及重复数据更新不回写整数日期范围', () => {
    const f = fixture();
    f.set({ from: 8.125, to: 22.875 });
    f.controller.action(f.chart, { type: 'zoomIn', revision: 1 });
    const zoomed = f.scale.getVisibleLogicalRange();
    expect(zoomed.to - zoomed.from).toBeCloseTo(11.8);
    f.controller.action(f.chart, { type: 'zoomIn', revision: 1 });
    for (let i = 0; i < 5; i++) f.controller.commit(f.chart, f.data, 'daily', f.controls, f.controller.snapshot(f.chart));
    expect(f.scale.getVisibleLogicalRange()).toEqual(zoomed);
    expect(f.scale.setVisibleLogicalRange).toHaveBeenCalledTimes(1);
    expect(f.scale.setVisibleRange).not.toHaveBeenCalled();
  });
  it('数据写入引起临时视口事件时，仍恢复写入前的精确缩放', () => {
    const f = fixture(); f.set({ from: 11.125, to: 17.875 });
    const before = f.controller.snapshot(f.chart);
    f.set({ from: 0, to: 29 });
    f.controller.commit(f.chart, [...f.data], 'daily', f.controls, before);
    expect(f.scale.getVisibleLogicalRange()).toEqual({ from: 11.125, to: 17.875 });
  });
  it('前插按共同日期迁移逻辑索引；离开最新端时追加不移动观察区间', () => {
    const f = fixture(); f.set({ from: 5.25, to: 12.75 });
    f.controller.commit(f.chart, points(-4, 35), 'daily', f.controls, f.controller.snapshot(f.chart));
    expect(f.scale.getVisibleLogicalRange()).toEqual({ from: 10.25, to: 17.75 });
    f.controller.commit(f.chart, points(-4, 38), 'daily', f.controls, f.controller.snapshot(f.chart));
    expect(f.scale.getVisibleLogicalRange()).toEqual({ from: 10.25, to: 17.75 });
  });
  it('处于最新端时只平移新增尾部，保留缩放宽度和小数边界', () => {
    const f = fixture(); f.set({ from: 20.125, to: 29.125 });
    f.controller.commit(f.chart, points(1, 32), 'daily', f.controls, f.controller.snapshot(f.chart));
    expect(f.scale.getVisibleLogicalRange()).toEqual({ from: 22.125, to: 31.125 });
  });
  it('新周期和显式重置初始化一次；相同自定义区间对象不会反复重置', () => {
    const f = fixture();
    f.controller.commit(f.chart, f.data, 'weekly', f.controls, f.controller.snapshot(f.chart));
    expect(f.scale.setVisibleRange).toHaveBeenCalledTimes(1);
    f.controller.updateControls(f.chart, { range: { from: '2026-01-05', to: '2026-01-15' }, reset: 0, focus: 0 });
    f.controller.updateControls(f.chart, { range: { from: '2026-01-05', to: '2026-01-15' }, reset: 0, focus: 0 });
    expect(f.scale.setVisibleRange).toHaveBeenCalledTimes(2);
    f.controller.updateControls(f.chart, { range: 30, reset: 1, focus: 0 });
    expect(f.scale.setVisibleRange).toHaveBeenCalledTimes(3);
  });
});
