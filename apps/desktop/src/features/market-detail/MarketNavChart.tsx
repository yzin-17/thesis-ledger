import { useEffect, useMemo, useRef, useState } from 'react';
import type { FundNavHistoryV1 } from '@thesis-ledger/schemas';
import { CrosshairMode, LineSeries, createChart } from 'lightweight-charts';
import { Button } from '@/components/ui/button';

const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

const rangeLabel = (months: number) => {
  if (months === 1) return '1月';
  if (months === 3) return '3月';
  if (months === 6) return '6月';
  return '1年';
};

const NAV_RANGES = [1, 3, 6, 12] as const;

export const navRangeAvailability = (history: FundNavHistoryV1, months: number) => {
  const earliest = history[0];
  const latest = history.at(-1);
  if (!earliest || !latest) {
    return { available: false, title: `${rangeLabel(months)}暂无净值历史` };
  }
  const cutoff = new Date(latest.navDate);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const available = Date.parse(earliest.navDate) <= cutoff.getTime();
  return {
    available,
    title: available
      ? `${rangeLabel(months)}已覆盖`
      : `${rangeLabel(months)}数据不足，当前仅覆盖 ${earliest.navDate.slice(0, 10)} 至 ${latest.navDate.slice(0, 10)}`,
  };
};

export function FundNavHistoryChart({ history }: { history: FundNavHistoryV1 }) {
  const containerRef = useRef<HTMLDivElement>(null);
  type ChartApi = ReturnType<typeof createChart>;
  type TimeScaleApi = ReturnType<ChartApi['timeScale']>;
  const chartRef = useRef<ChartApi | null>(null);
  const lineRef = useRef<ReturnType<ChartApi['addSeries']> | null>(null);
  const previousVisibleRangeRef = useRef<ReturnType<TimeScaleApi['getVisibleRange']>>(null);
  const requestedInitialRangeRef = useRef<ReturnType<TimeScaleApi['getVisibleRange']>>(null);
  const firstLayoutPendingRef = useRef(true);
  const lastResetRevisionRef = useRef(0);
  const lastFocusRevisionRef = useRef(0);
  const lastRangeMonthsRef = useRef(3);
  const onVisibleRangeChangeRef = useRef<
    ((range: { from: string; to: string } | null) => void) | null
  >(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [rangeMonths, setRangeMonths] = useState(3);
  const [resetRevision, setResetRevision] = useState(0);
  const [focusRevision, setFocusRevision] = useState(0);
  const [viewport, setViewport] = useState<{ from: string; to: string } | null>(null);
  const rangeAvailability = useMemo(
    () => NAV_RANGES.map((months) => ({ months, ...navRangeAvailability(history, months) })),
    [history],
  );
  const unavailableRanges = rangeAvailability.filter((range) => !range.available);
  const coverageNotice =
    unavailableRanges.length > 0 && history.length > 0
      ? `当前净值历史覆盖 ${history[0]!.navDate.slice(0, 10)} 至 ${history.at(-1)!.navDate.slice(0, 10)}，暂未覆盖 ${unavailableRanges.map((range) => rangeLabel(range.months)).join('、')}`
      : null;
  const visibleHistory = useMemo(() => {
    const latest = history.at(-1);
    if (!latest) return [];
    const cutoff = new Date(latest.navDate);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - rangeMonths);
    return history.filter((point) => new Date(point.navDate).getTime() >= cutoff.getTime());
  }, [history, rangeMonths]);
  const selectedDate = locked ?? hovered;
  const selected =
    visibleHistory.find((point) => point.navDate === selectedDate) ?? visibleHistory.at(-1);
  const viewportHistory = viewport
    ? history.filter((point) => point.navDate.slice(0, 10) >= viewport.from && point.navDate.slice(0, 10) <= viewport.to)
    : visibleHistory;
  const viewportFirst = viewportHistory[0];
  const viewportLast = viewportHistory.at(-1);
  const viewportChange =
    viewportFirst && viewportLast && viewportFirst.unitNav !== 0
      ? viewportLast.unitNav / viewportFirst.unitNav - 1
      : null;
  onVisibleRangeChangeRef.current = (range) => setViewport(range);

  useEffect(() => {
    if (history.length === 0) return;
    const selected = rangeAvailability.find((range) => range.months === rangeMonths);
    if (selected?.available) return;
    const fallback = [...rangeAvailability].reverse().find((range) => range.available);
    if (fallback) setRangeMonths(fallback.months);
  }, [history, rangeAvailability, rangeMonths]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      autoSize: true,
      height: 220,
      layout: { background: { color: 'transparent' }, textColor: '#64748b' },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
      timeScale: { borderColor: 'rgba(148, 163, 184, 0.35)', timeVisible: false },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.16)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.16)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const line = chart.addSeries(LineSeries, {
      color:
        getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim() ||
        '#2563eb',
      lineWidth: 2,
    });
    const hoveredRef = { current: setHovered };
    const lockedRef = { current: setLocked };
    const crosshairHandler = (param: { time?: unknown }) =>
      hoveredRef.current(typeof param.time === 'string' ? param.time : null);
    const clickHandler = (param: { time?: unknown }) =>
      lockedRef.current(typeof param.time === 'string' ? param.time : null);
    chart.subscribeCrosshairMove(crosshairHandler);
    chart.subscribeClick(clickHandler);
    const visibleRangeHandler = () => {
      const range = chart.timeScale().getVisibleRange();
      if (range && typeof range.from === 'string' && typeof range.to === 'string') {
        if (firstLayoutPendingRef.current) return;
        previousVisibleRangeRef.current = range;
        onVisibleRangeChangeRef.current?.({ from: range.from, to: range.to });
      }
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(visibleRangeHandler);
    const resizeObserver = new ResizeObserver(() => {
      const requested = firstLayoutPendingRef.current
        ? requestedInitialRangeRef.current
        : previousVisibleRangeRef.current;
      if (!requested) return;
      chart.timeScale().setVisibleRange(requested);
      previousVisibleRangeRef.current = requested;
      firstLayoutPendingRef.current = false;
      onVisibleRangeChangeRef.current?.({ from: requested.from as string, to: requested.to as string });
    });
    resizeObserver.observe(container);
    chartRef.current = chart;
    lineRef.current = line;
    return () => {
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.unsubscribeClick(clickHandler);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(visibleRangeHandler);
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      lineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const line = lineRef.current;
    const latest = history.at(-1);
    if (!chart || !line || !latest || history.length === 0) return;
    line.setData(history.map((point) => ({ time: point.navDate, value: point.unitNav })));
    const previous = previousVisibleRangeRef.current;
    const shouldReset = resetRevision !== lastResetRevisionRef.current;
    const shouldFocusLatest = focusRevision !== lastFocusRevisionRef.current;
    const shouldChangeRange = rangeMonths !== lastRangeMonthsRef.current;
    lastResetRevisionRef.current = resetRevision;
    lastFocusRevisionRef.current = focusRevision;
    lastRangeMonthsRef.current = rangeMonths;
    if (shouldReset || shouldChangeRange || !previous) {
      const cutoff = new Date(latest.navDate);
      cutoff.setUTCMonth(cutoff.getUTCMonth() - rangeMonths);
      chart
        .timeScale()
        .setVisibleRange({ from: cutoff.toISOString().slice(0, 10), to: latest.navDate });
      requestedInitialRangeRef.current = {
        from: cutoff.toISOString().slice(0, 10),
        to: latest.navDate,
      };
      if (previous) firstLayoutPendingRef.current = false;
    } else if (shouldFocusLatest) {
      const logical = chart.timeScale().getVisibleLogicalRange();
      if (logical) {
        const width = Math.max(Number(logical.to) - Number(logical.from), 1);
        const to = history.length - 1;
        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, to - width),
          to,
        });
      }
    } else {
      chart.timeScale().setVisibleRange(previous);
    }
    previousVisibleRangeRef.current = chart.timeScale().getVisibleRange();
  }, [focusRevision, history, rangeMonths, resetRevision]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !locked) return;
      event.preventDefault();
      event.stopPropagation();
      setLocked(null);
      setHovered(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [locked]);

  return (
    <div className="grid gap-2 rounded-lg bg-muted/30 p-3" data-market-nav-chart>
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="净值范围">
        {rangeAvailability.map((range) => (
          <Button
            key={range.months}
            type="button"
            size="sm"
            variant={rangeMonths === range.months ? 'secondary' : 'ghost'}
            aria-pressed={rangeMonths === range.months}
            disabled={!range.available}
            title={range.title}
            onClick={() => {
              setRangeMonths(range.months);
              setLocked(null);
              setHovered(null);
            }}
          >
            {rangeLabel(range.months)}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setRangeMonths(3);
            setLocked(null);
            setHovered(null);
            setResetRevision((value) => value + 1);
          }}
        >
          重置
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setLocked(null);
            setHovered(null);
            setFocusRevision((value) => value + 1);
          }}
        >
          回到最新
        </Button>
      </div>
      {coverageNotice ? (
        <p className="m-0 text-xs text-muted-foreground" role="status">
          {coverageNotice}
        </p>
      ) : null}
      <div
        ref={containerRef}
        className="h-[220px] max-h-[220px] min-h-0 min-w-0 w-full max-w-full overflow-hidden [&_table]:h-auto [&_table]:min-w-0 [&_table]:w-auto [&_td]:min-w-0 [&_td]:p-0"
      />
      <div
        className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"
        role="status"
      >
        <span>
          {selectedDate
            ? `${locked ? '已锁定' : '悬停'} ${selectedDate}`
            : '悬停查看，点击锁定，Esc 恢复最新'}
        </span>
        <span>
          {viewportFirst ? `${viewportFirst.navDate.slice(0, 10)} 至 ${viewportLast?.navDate.slice(0, 10)}` : '日期未知'} · 币种 CNY
        </span>
        <span>
          单位净值 {selected ? number.format(selected.unitNav) : '—'} · 来源 {selected?.provider ?? '未知'}
          {viewportChange === null
            ? ''
            : ` · 可视区间 ${viewportChange >= 0 ? '+' : ''}${(viewportChange * 100).toFixed(2)}%`}
        </span>
      </div>
    </div>
  );
}
