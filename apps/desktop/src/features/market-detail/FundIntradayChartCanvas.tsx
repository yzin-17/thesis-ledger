import { cn } from '@/lib/utils';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { FundValuationToday } from '@thesis-ledger/schemas';
import { createChart, CrosshairMode, LineSeries, type IChartApi, type ISeriesApi, type UTCTimestamp, type Time, type AutoscaleInfo } from 'lightweight-charts';
import type { ChartViewportSession, ChartViewAction, ViewportControls } from './market-chart-viewport-controller.js';
import type { fundIntradaySegments } from './fund-intraday-series.js';
const clock = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
const timeLabel = (time: Time) => typeof time === 'number' ? clock.format(new Date(time * 1000)) : '';

export function FundIntradayChartCanvas({ points, segments, scope, expanded, controls, viewAction, session, onHover, onClick }: {
  points: FundValuationToday['points'] | undefined;
  segments: ReturnType<typeof fundIntradaySegments>;
  scope: string;
  expanded: boolean;
  controls: ViewportControls;
  viewAction: ChartViewAction | undefined;
  session: RefObject<ChartViewportSession>;
  onHover: (time: number | null) => void;
  onClick: (time: number | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Line'>[]>([]);
  const controlsRef = useRef(controls); controlsRef.current = controls;
  const callbacks = useRef({ onHover, onClick }); callbacks.current = { onHover, onClick };
  const viewportPoints = useMemo(() => points?.map((point) => ({ date: point.at })) ?? [], [points]);
  useEffect(() => {
    if (!container.current) return;
    const instance = createChart(container.current, {
      autoSize: true, height: expanded ? 390 : 220,
      layout: { background: { color: 'transparent' }, textColor: '#64748b', attributionLogo: false },
      localization: { timeFormatter: timeLabel },
      timeScale: { lockVisibleTimeRangeOnResize: true, timeVisible: true, secondsVisible: false, tickMarkFormatter: timeLabel },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
      crosshair: { mode: CrosshairMode.Normal },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(148,163,184,0.16)' } },
    });
    const hover = (event: { time?: unknown }) => callbacks.current.onHover(typeof event.time === 'number' ? event.time : null);
    const click = (event: { time?: unknown }) => callbacks.current.onClick(typeof event.time === 'number' ? event.time : null);
    instance.subscribeCrosshairMove(hover); instance.subscribeClick(click);
    chart.current = instance;
    return () => {
      instance.unsubscribeCrosshairMove(hover); instance.unsubscribeClick(click);
      session.current.snapshot = session.current.controller.snapshot(instance);
      instance.remove(); chart.current = null; series.current = [];
    };
  }, [expanded]);

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    const before = session.current.snapshot ?? session.current.controller.snapshot(instance);
    session.current.snapshot = null;
    series.current.forEach((line) => instance.removeSeries(line));
    const anchor = points?.filter((point) => point.valuation.estimatedNav !== null).at(-1)?.valuation.anchor;
    const lines = segments.map((segment, index) => {
      const line = instance.addSeries(LineSeries, {
        color: '#59636e', lineWidth: 2, lineStyle: 2,
        pointMarkersVisible: segment.length === 1, pointMarkersRadius: 4,
        priceLineVisible: false, lastValueVisible: index === segments.length - 1,
        priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
        autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
          const info = original();
          if (!info?.priceRange || !anchor) return info;
          return { ...info, priceRange: {
            minValue: Math.min(anchor.unitNav, info.priceRange.minValue),
            maxValue: Math.max(anchor.unitNav, info.priceRange.maxValue),
          } };
        },
      });
      line.setData(segment.map((point) => ({ ...point, time: point.time as UTCTimestamp })));
      return line;
    });
    if (points?.length) {
      const timeline = instance.addSeries(LineSeries, {
        lineVisible: false, pointMarkersVisible: false, priceLineVisible: false, lastValueVisible: false,
      });
      timeline.setData(points.map((point) => ({ time: Date.parse(point.at) / 1000 as UTCTimestamp })));
      lines.unshift(timeline);
    }
    series.current = lines;
    if (anchor) series.current.at(-1)?.createPriceLine({
      price: anchor.unitNav, title: `正式净值 ${anchor.navDate.slice(5, 10)}`,
      color: '#2563eb', lineWidth: 1, lineStyle: 0, axisLabelVisible: true,
    });
    session.current.controller.commit(instance, viewportPoints, scope, controlsRef.current, before);
  }, [segments, points, viewportPoints, scope, expanded]);
  useEffect(() => {
    if (chart.current) session.current.controller.updateControls(chart.current, controls);
  }, [controls, expanded]);
  useEffect(() => {
    if (chart.current) session.current.controller.action(chart.current, viewAction);
  }, [viewAction, expanded]);

  return <div ref={container} data-fund-intraday-canvas className={cn('min-w-0 overflow-hidden [&_table]:h-auto [&_table]:min-w-0 [&_table]:w-auto [&_td]:min-w-0 [&_td]:p-0', expanded ? 'h-[390px] max-h-[390px]' : 'h-[220px] max-h-[220px]')} />;
}
