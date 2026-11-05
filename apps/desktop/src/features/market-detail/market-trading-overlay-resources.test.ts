import { describe, expect, it, vi } from 'vitest';
import { attachTradingOverlays } from './market-trading-overlay-resources.js';

const createSeriesMarkers = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => { detach: () => void }>(() => ({ detach: vi.fn() })),
);
vi.mock('lightweight-charts', () => ({ createSeriesMarkers, LineSeries: {} }));

describe('交易图层资源生命周期', () => {
  it('参考线、标记和反向测量均绑定价格Series并完整释放', () => {
    const measure = { setData: vi.fn() };
    const chart = { addSeries: vi.fn(() => measure), removeSeries: vi.fn() };
    const series = {
      createPriceLine: vi.fn((line: Record<string, unknown>) => ({ ...line })),
      removePriceLine: vi.fn(),
    };
    const cleanup = attachTradingOverlays(chart as never, series as never, {
      markers: [
        {
          id: 'buy-1',
          eventId: 'event',
          factId: 'fact',
          key: '2026-11-04',
          side: 'buy',
          occurredAt: '2026-11-04T00:00:00Z',
          tradingDate: '2026-11-04',
          timePrecision: 'DATE',
          currency: 'CNY',
          price: '10.12',
          quantity: '100',
        },
      ],
      lines: [
        { kind: 'cost', price: 10.12, title: '当前持仓成本参考' },
        { kind: 'risk', price: 9, title: '手动止损参考' },
      ],
      measurement: { from: '2026-11-04', to: '1999-12-31', fromPrice: 11, toPrice: 10 },
    });
    expect(createSeriesMarkers.mock.calls.at(-1)).toMatchObject([
      series,
      [
        {
          time: '2026-11-04',
          shape: 'arrowUp',
        },
      ],
      { autoScale: false },
    ]);
    expect(JSON.stringify(createSeriesMarkers.mock.calls.at(-1)?.[1])).toContain('（按日）');
    expect(series.createPriceLine).toHaveBeenCalledTimes(2);
    expect(measure.setData).toHaveBeenCalledWith([
      { time: '1999-12-31', value: 10 },
      { time: '2026-11-04', value: 11 },
    ]);
    cleanup();
    const last = createSeriesMarkers.mock.results.at(-1);
    if (last?.type !== 'return') throw new Error('标记资源未创建');
    expect(last.value.detach).toHaveBeenCalledOnce();
    expect(series.removePriceLine).toHaveBeenCalledTimes(2);
    expect(chart.removeSeries).toHaveBeenCalledWith(measure);
  });
  it('空图层不分配资源，同一点测量不会创建重复时间', () => {
    const markerCount = createSeriesMarkers.mock.calls.length;
    const measure = { setData: vi.fn() },
      chart = { addSeries: vi.fn(() => measure), removeSeries: vi.fn() };
    const series = { createPriceLine: vi.fn(), removePriceLine: vi.fn() };
    attachTradingOverlays(chart as never, series as never, { markers: [], lines: [] })();
    expect(createSeriesMarkers.mock.calls).toHaveLength(markerCount);
    const cleanup = attachTradingOverlays(chart as never, series as never, {
      markers: [],
      lines: [],
      measurement: { from: '2026-11-04', to: '2026-11-04', fromPrice: 11, toPrice: 11 },
    });
    expect(measure.setData).toHaveBeenCalledWith([{ time: '2026-11-04', value: 11 }]);
    cleanup();
  });
});
