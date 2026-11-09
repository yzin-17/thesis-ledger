import type { Time } from 'lightweight-charts';
import { initialChartTimeRange, type ChartRange, type ChartViewportPoint } from './market-chart-range.js';

type LogicalRange = { from: number; to: number };
type Chart = { timeScale: () => {
  getVisibleLogicalRange: () => LogicalRange | null;
  setVisibleLogicalRange: (range: LogicalRange) => void;
  setVisibleRange: (range: { from: Time; to: Time }) => void;
} };
export type ViewportControls = { range: ChartRange; reset: number; focus: number };
export type ChartViewAction = { type: 'zoomIn' | 'zoomOut' | 'panEarlier' | 'panLater'; revision: number };
type Snapshot = { points: readonly ChartViewportPoint[]; scope: string | null; logical: LogicalRange | null };

function alignRange(before: Snapshot, points: readonly ChartViewportPoint[]) {
  if (!before.logical) return null;
  const indices = new Map(points.map((point, index) => [point.date, index]));
  const anchor = before.points.findIndex((point) => indices.has(point.date));
  if (anchor < 0) return null;
  const offset = indices.get(before.points[anchor]!.date)! - anchor;
  let shift = offset;
  const following = before.logical.to >= before.points.length - 1 - 0.5;
  if (following && before.points.at(-1)?.date !== points.at(-1)?.date)
    shift = points.length - before.points.length;
  return { from: before.logical.from + shift, to: before.logical.to + shift };
}

export class MarketChartViewportController {
  private points: readonly ChartViewportPoint[] = [];
  private scope: string | null = null;
  private controls: { range: string; reset: number; focus: number } | null = null;
  private actionRevision = 0;

  reset(actionRevision: number) {
    this.points = [];
    this.scope = null;
    this.controls = null;
    this.actionRevision = actionRevision;
  }

  snapshot(chart: Chart): Snapshot {
    const logical = chart.timeScale().getVisibleLogicalRange();
    return { points: this.points, scope: this.scope, logical: logical ? { ...logical } : null };
  }

  private write(chart: Chart, range: LogicalRange) {
    const current = chart.timeScale().getVisibleLogicalRange();
    if (current && Math.abs(current.from - range.from) < 1e-7 && Math.abs(current.to - range.to) < 1e-7) return;
    chart.timeScale().setVisibleLogicalRange(range);
  }

  commit(chart: Chart, points: readonly ChartViewportPoint[], scope: string, controls: ViewportControls, before: Snapshot) {
    if (!points.length) return;
    const rangeKey = JSON.stringify(controls.range);
    const reset = before.scope !== scope || !this.controls || this.controls.range !== rangeKey || this.controls.reset !== controls.reset;
    const focus = this.controls && this.controls.focus !== controls.focus;
    this.points = points;
    this.scope = scope;
    this.controls = { range: rangeKey, reset: controls.reset, focus: controls.focus };
    const aligned = alignRange(before, points);
    if (reset || !aligned) {
      const range = initialChartTimeRange(points, controls.range);
      if (range) chart.timeScale().setVisibleRange(range);
      return;
    }
    if (focus) {
      const width = aligned.to - aligned.from;
      const to = points.length - 1;
      this.write(chart, { from: to - width, to });
      return;
    }
    this.write(chart, aligned);
  }

  updateControls(chart: Chart, controls: ViewportControls) {
    if (!this.scope || !this.points.length) return;
    if (this.controls?.range === JSON.stringify(controls.range) && this.controls.reset === controls.reset && this.controls.focus === controls.focus) return;
    this.commit(chart, this.points, this.scope, controls, this.snapshot(chart));
  }

  action(chart: Chart, action: ChartViewAction | undefined) {
    if (!action || action.revision === this.actionRevision) return;
    this.actionRevision = action.revision;
    const logical = chart.timeScale().getVisibleLogicalRange();
    if (!logical || this.points.length < 2) return;
    const last = this.points.length - 1;
    const width = Math.max(0.01, logical.to - logical.from);
    let from: number, to: number;
    if (action.type === 'zoomIn' || action.type === 'zoomOut') {
      const factor = action.type === 'zoomIn' ? 0.8 : 1.25;
      const nextWidth = Math.min(last, Math.max(Math.min(2, last), width * factor));
      from = Math.max(0, Math.min(last - nextWidth, (logical.from + logical.to - nextWidth) / 2));
      to = from + nextWidth;
    } else {
      const shift = width * 0.25 * (action.type === 'panEarlier' ? -1 : 1);
      from = Math.max(0, Math.min(Math.max(0, last - width), logical.from + shift));
      to = from + width;
    }
    this.write(chart, { from, to });
  }
}

export type ChartViewportSession = { controller: MarketChartViewportController; snapshot: ReturnType<MarketChartViewportController['snapshot']> | null };
