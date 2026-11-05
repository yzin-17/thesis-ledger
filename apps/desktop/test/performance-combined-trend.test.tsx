// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { PerformanceTrendChart } from '../src/features/performance/PerformanceTrendChart.js';
import {
  pnlPointsInRange,
  pnlQueryRange,
} from '../src/features/performance/performance-trend-range.js';
import { performanceTrendGeometry } from '../src/features/performance/performance-trend-model.js';
import type { PerformanceSeriesPoint } from '../src/features/performance/performance.types.js';
import type { PnlChartPoint } from '../src/features/performance/performance-pnl-model.js';

const asset = (day: number, value: number): PerformanceSeriesPoint => ({
  at: `2026-11-0${day}T08:00:00Z`,
  value,
  currency: 'CNY',
  valuationBasis: 'OFFICIAL',
  disclosureCoverage: 1,
  pricedCoverage: 1,
  dataQuality: 'COMPLETE',
  sourceSnapshotId: `s${day}`,
});
const pnl = (day: number, value: number | null): PnlChartPoint => ({
  at: asset(day, 0).at,
  value,
  realizedPnl: value,
  unrealizedPnl: 0,
  current: day === 4,
  reason: value === null ? 'price_unavailable' : null,
});

describe('资产与累计盈亏共享时间轴', () => {
  it('不同采样时点保持真实位置和缺口，两个尺度不互相挤压', () => {
    const chart = performanceTrendGeometry(
      [asset(1, 100000), asset(4, 120000)],
      [pnl(1, -10), pnl(2, null), pnl(3, 0), pnl(4, 20)],
      720,
    );
    expect(chart.assetCoordinates[0]!.x).toBe(chart.pnlCoordinates[0]!.x);
    expect(chart.assetCoordinates[1]!.x).toBe(chart.pnlCoordinates[3]!.x);
    expect(chart.pnlCoordinates[1]!.y).toBeNull();
    expect(chart.segments.map((segment) => segment.length)).toEqual([1, 2]);
    expect(chart.timeline[1]!.asset).toBeUndefined();
    expect(chart.timeline[2]!.pnl?.value).toBe(0);
    expect(chart.pnlAxis.y(0)).toBeGreaterThan(chart.padding.top);
    expect(chart.assetCoordinates.every((point) => Number.isFinite(point.y))).toBe(true);
    for (const points of [[], [pnl(1, 0)], [pnl(1, null)]]) {
      const sparse = performanceTrendGeometry([], points, 280);
      expect(sparse.pnlAxis.ticks.every((tick) => Number.isFinite(tick.y))).toBe(true);
    }
  });
  it('统一短区间与五年区间只筛选原盈亏点，缺口不被过滤为零', () => {
    expect(pnlQueryRange('1D')).toBe('1M');
    expect(pnlQueryRange('5D')).toBe('1M');
    expect(pnlQueryRange('5Y')).toBe('ALL');
    const points = [pnl(1, 10), pnl(2, null), pnl(3, 0), pnl(4, 20)];
    expect(pnlPointsInRange(points, '1D', asset(4, 0).at)).toEqual(points.slice(2));
    expect(pnlPointsInRange(points, '5D', asset(4, 0).at)).toEqual(points);
    expect(pnlPointsInRange(points, '1M', asset(4, 0).at)[1]?.value).toBeNull();
    expect(pnlPointsInRange(points, '5Y', '2032-11-04T08:00:00Z')).toEqual([]);
  });
  it('键盘共享游标同时读取两个指标，异步时点不借用邻点，空点显示原原因', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <PerformanceTrendChart
            seriesPoints={[asset(1, 100000), asset(4, 120000)]}
            interval="1d"
            pnlPoints={[pnl(1, -10), pnl(2, null), pnl(3, 0), pnl(4, 20)]}
            pnlCurrency="CNY"
          />,
        ),
      );
      const svg = host.querySelector('svg')!;
      await act(async () => svg.focus());
      expect(host.querySelector('[role="status"]')?.textContent).toContain('资产总值 ¥120,000.00');
      expect(host.querySelector('[role="status"]')?.textContent).toContain('累计盈亏 ¥20.00');
      expect(host.textContent).toContain('左轴');
      expect(host.textContent).toContain('右轴');
      await act(async () =>
        svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })),
      );
      expect(host.querySelector('[role="status"]')?.textContent).toContain('该时点无记录');
      expect(host.querySelector('[role="status"]')?.textContent).toContain('累计盈亏 ¥0.00');
      await act(async () =>
        svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })),
      );
      expect(host.querySelector('[role="status"]')?.textContent).toContain('行情数据不完整');
      await act(async () =>
        svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
      );
      expect(host.querySelector('[role="status"]')).toBeNull();
      vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 720 } as DOMRect);
      await act(async () =>
        svg.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 64 })),
      );
      expect(host.querySelector('[role="status"]')?.textContent).toContain('累计盈亏 -¥10.00');
      await act(async () =>
        svg.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 656 })),
      );
      expect(host.querySelector('[role="status"]')?.textContent).toContain('当前估值');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
