import { cn } from '@/lib/utils';
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { CrosshairMode, LineSeries, createChart } from 'lightweight-charts';
import type { Currency, FundNavHistory } from '@thesis-ledger/schemas';
import type { PnlChartPoint } from '../performance/performance-pnl-model.js';
import { navPnlData, useNavPnlSeries } from './fund-nav-pnl-series.js';
import { chartInteractionKey, chartVisibleRange } from './market-chart-time.js';
import type { ChartViewportSession, ChartViewAction, ViewportControls } from './market-chart-viewport-controller.js';
import { useFundNavReferenceResources } from './useFundNavReferenceResources.js';
import { useFundNavTradeMarkers } from './useFundNavTradeMarkers.js';
import type { FundNavReferences } from './useFundNavReferences.js';
import type { FundNavTradeGroup } from './fund-nav-trade-model.js';

export const navChartLayoutOptions = { background: { color: 'transparent' }, textColor: '#64748b', attributionLogo: false } as const;
export function FundNavChartCanvas({ history, pnl, references, groups, selectTrade, onHover, onClick, onViewport, controls, viewAction, session, expanded }: {
  history: FundNavHistory;
  pnl: { points: PnlChartPoint[]; currency: Currency } | undefined;
  references: FundNavReferences;
  groups: FundNavTradeGroup[];
  selectTrade: (id: string) => void;
  onHover: (date: string | null) => void;
  onClick: (event: { time?: unknown; hoveredObjectId?: unknown }) => void;
  onViewport: (range: { from: string; to: string } | null) => void;
  controls: ViewportControls;
  viewAction: ChartViewAction | undefined;
  session: RefObject<ChartViewportSession>;
  expanded: boolean;
}) {
  type Chart = ReturnType<typeof createChart>;
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const lineRef = useRef<ReturnType<Chart['addSeries']> | null>(null);
  const callbacks = useRef({ onHover, onClick, onViewport });
  callbacks.current = { onHover, onClick, onViewport };
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const points = useMemo(() => {
    const pnlDates = navPnlData(pnl?.points ?? []).dated.filter(([, point]) => point.value !== null).map(([date]) => date);
    return [...new Set([...history.map((point) => point.navDate), ...pnlDates])].sort().map((date) => ({ date }));
  }, [history, pnl?.points]);
  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, {
      autoSize: true, height: expanded ? 390 : 220, layout: navChartLayoutOptions,
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
      timeScale: { minBarSpacing: 0.01, lockVisibleTimeRangeOnResize: true, borderColor: 'rgba(148, 163, 184, 0.35)', timeVisible: false },
      grid: { vertLines: { color: 'rgba(148, 163, 184, 0.16)' }, horzLines: { color: 'rgba(148, 163, 184, 0.16)' } },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const line = chart.addSeries(LineSeries, { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim() || '#2563eb',
      lineWidth: 2, priceScaleId: 'right', priceFormat: { type: 'price', precision: 4, minMove: 0.0001 } });
    const hover = (event: { time?: unknown }) => callbacks.current.onHover(chartInteractionKey(event.time));
    const click = (event: { time?: unknown; hoveredObjectId?: unknown }) => callbacks.current.onClick(event);
    const viewport = () => callbacks.current.onViewport(chartVisibleRange(chart.timeScale().getVisibleRange()));
    chart.subscribeCrosshairMove(hover); chart.subscribeClick(click);
    chart.timeScale().subscribeVisibleTimeRangeChange(viewport);
    chartRef.current = chart; lineRef.current = line;
    return () => {
      session.current.snapshot = session.current.controller.snapshot(chart);
      chart.unsubscribeCrosshairMove(hover); chart.unsubscribeClick(click);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(viewport);
      chart.remove(); chartRef.current = null; lineRef.current = null;
    };
  }, [expanded, session]);
  useLayoutEffect(() => {
    if (chartRef.current && !session.current.snapshot)
      session.current.snapshot = session.current.controller.snapshot(chartRef.current);
  }, [history, points, expanded, session]);
  useNavPnlSeries(chartRef, pnl?.points, pnl?.currency);
  useEffect(() => {
    const chart = chartRef.current, line = lineRef.current;
    if (!chart || !line || !history.length) return;
    const controller = session.current.controller;
    const before = session.current.snapshot ?? controller.snapshot(chart);
    session.current.snapshot = null;
    line.setData(history.map((point) => ({ time: point.navDate, value: point.unitNav })));
    controller.commit(chart, points, references.state.scope, controlsRef.current, before);
    callbacks.current.onViewport(chartVisibleRange(chart.timeScale().getVisibleRange()));
  }, [history, points, references.state.scope, expanded, session]);
  useEffect(() => {
    if (chartRef.current) session.current.controller.updateControls(chartRef.current, controls);
  }, [controls, expanded, session]);
  useEffect(() => {
    if (chartRef.current) session.current.controller.action(chartRef.current, viewAction);
  }, [viewAction, expanded, session]);
  useFundNavTradeMarkers(chartRef, lineRef, groups, selectTrade);
  useFundNavReferenceResources(chartRef, lineRef, history, references.costPrice, references.measurement);
  return <div ref={container} data-fund-nav-canvas
    className={cn('min-h-0 min-w-0 w-full max-w-full overflow-hidden [&_table]:h-auto [&_table]:min-w-0 [&_table]:w-auto [&_td]:min-w-0 [&_td]:p-0',
      expanded ? 'h-[390px] max-h-[390px]' : 'h-[220px] max-h-[220px]')} />;
}
