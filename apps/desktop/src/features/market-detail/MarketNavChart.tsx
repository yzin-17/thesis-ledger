import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Currency, FundNavHistory } from '@thesis-ledger/schemas';
import { CrosshairMode, LineSeries, createChart } from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { MarketNavChartReadout } from './MarketNavChartReadout.js';
import { MarketChartAttribution } from './MarketChartAttribution.js';
import type { PnlChartPoint } from '../performance/performance-pnl-model.js';
import { navPnlData, useNavPnlSeries } from './fund-nav-pnl-series.js';
import { navViewportChange } from './nav-chart-viewport.js';
import { FundIntradayChart } from './FundIntradayChart.js';

const rangeLabel = (months: number) => {
  if (months === 1) return '1月';
  if (months === 3) return '3月';
  if (months === 6) return '6月';
  return '1年';
};

const NAV_RANGES = [1, 3, 6, 12] as const;

export const navChartLayoutOptions = {
  background: { color: 'transparent' },
  textColor: '#64748b',
  attributionLogo: false,
} as const;

export const navRangeAvailability = (history: FundNavHistory, months: number) => {
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

type FundNavHistoryChartProps = {
  history: FundNavHistory;
  pnl?: { points: PnlChartPoint[]; currency: Currency; notice?: ReactNode };
};

export function FundNavHistoryChart(props: FundNavHistoryChartProps) {
  const [today, setToday] = useState(false);
  const symbol = props.history.at(-1)?.symbol;
  if (today && symbol) return <FundIntradayChart key={symbol} symbol={symbol} onHistory={() => setToday(false)} />;
  return <HistoricalFundNavChart {...props} onToday={() => setToday(true)} />;
}

function HistoricalFundNavChart({ history: sourceHistory, pnl, onToday }: FundNavHistoryChartProps & { onToday: () => void }) {
  const history = useMemo(
    () => sourceHistory.map((point) => ({ ...point, navDate: point.navDate.slice(0, 10) })),
    [sourceHistory],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const pnlData = useMemo(() => navPnlData(pnl?.points ?? []), [pnl?.points]);
  const lastDate = [history.at(-1)?.navDate, pnlData.dated.at(-1)?.[0]].filter(Boolean).sort().at(-1);
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
  const [hovered, setHovered] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [rangeMonths, setRangeMonths] = useState(3);
  const [resetRevision, setResetRevision] = useState(0);
  const [focusRevision, setFocusRevision] = useState(0);
  const [viewport, setViewport] = useState<{ from: string; to: string } | null>(null);
  const viewportChange = useMemo(() => navViewportChange(history, viewport), [history, viewport]);
  const rangeAvailability = useMemo(
    () => NAV_RANGES.map((months) => ({ months, ...navRangeAvailability(history, months) })),
    [history],
  );
  const selectedDate = locked ?? hovered;
  const selected = selectedDate ? history.find((point) => point.navDate === selectedDate) : history.at(-1);
  const selectedPnl = selectedDate ? pnlData.dated.find(([date]) => date === selectedDate) : pnlData.dated.at(-1);

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
      layout: navChartLayoutOptions,
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
      priceScaleId: 'right',
      priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
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
        setViewport((current) => {
          if (current?.from === range.from && current.to === range.to) return current;
          return { from: range.from as string, to: range.to as string };
        });
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
      visibleRangeHandler();
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

  useNavPnlSeries(chartRef, pnl?.points, pnl?.currency);

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
      const cutoff = new Date(lastDate ?? latest.navDate);
      cutoff.setUTCMonth(cutoff.getUTCMonth() - rangeMonths);
      chart
        .timeScale()
        .setVisibleRange({ from: cutoff.toISOString().slice(0, 10), to: lastDate ?? latest.navDate });
      requestedInitialRangeRef.current = {
        from: cutoff.toISOString().slice(0, 10),
        to: lastDate ?? latest.navDate,
      };
      if (previous) firstLayoutPendingRef.current = false;
    } else if (shouldFocusLatest) {
      chart.timeScale().scrollToRealTime();
    } else {
      chart.timeScale().setVisibleRange(previous);
    }
    previousVisibleRangeRef.current = chart.timeScale().getVisibleRange();
  }, [focusRevision, history, rangeMonths, resetRevision, lastDate]);

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
        <Button type="button" size="sm" variant="ghost" onClick={onToday}>今日</Button>
        {rangeAvailability.map((range) => (
          <Button
            key={range.months}
            type="button"
            size="sm"
            // 与用途切换同一套语义：未选中弱化为次要文字，选中用底色 + 主文字色，由 aria-pressed 驱动。
            variant="tab"
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
      {pnl ? (
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground" aria-label="净值与累计盈亏图例">
          <span>┄ 累计盈亏（{pnl.currency}，左轴）{pnlData.dated.filter(([, point]) => point.value !== null).length === 1 ? ' · 单点' : ''}</span>
          <span>━ 单位净值（右轴）</span>
        </div>
      ) : null}
      {pnl?.notice}
      <div
        ref={containerRef}
        className="h-[220px] max-h-[220px] min-h-0 min-w-0 w-full max-w-full overflow-hidden [&_table]:h-auto [&_table]:min-w-0 [&_table]:w-auto [&_td]:min-w-0 [&_td]:p-0"
      />
      <MarketNavChartReadout
        selectedDate={selectedDate}
        locked={locked !== null}
        selected={selected}
        viewportChange={viewportChange}
        pnl={pnl ? { currency: pnl.currency, value: selectedPnl?.[1].value ?? null, date: selectedPnl?.[0] } : undefined}
      />
      <div className="text-xs text-muted-foreground"><MarketChartAttribution /></div>
    </div>
  );
}
