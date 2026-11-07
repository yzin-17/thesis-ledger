import { formatMarketNumber, formatPercentValue } from '@thesis-ledger/domain';
import { Spinner } from '@/components/ui/spinner';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createChart, CrosshairMode, LineSeries, type IChartApi, type ISeriesApi, type UTCTimestamp, type Time, type AutoscaleInfo } from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { MarketChartAttribution } from './MarketChartAttribution.js';
import { fundIntradaySegments } from './fund-intraday-series.js';

const clock = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
const timeLabel = (time: Time) => typeof time === 'number' ? clock.format(new Date(time * 1000)) : '';

export function FundIntradayChart({ symbol, onHistory }: { symbol: string; onHistory: () => void }) {
  const query = useQuery({
    queryKey: ['market', 'fund-valuation-today', symbol, day.format(new Date())],
    queryFn: ({ signal }) => getDesktopApiClient().market.getFundValuationToday(symbol, signal),
    staleTime: 15_000, refetchInterval: 60_000, refetchIntervalInBackground: false, retry: false,
  });
  const points = query.data?.points;
  const segments = useMemo(() => fundIntradaySegments(points ?? []), [points]);
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Line'>[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [locked, setLocked] = useState<number | null>(null);
  const selectedTime = locked ?? hovered;
  const selected = selectedTime === null ? points?.at(-1)
    : points?.find((point) => Date.parse(point.at) / 1000 === selectedTime);
  const current = selected?.valuation;

  useEffect(() => {
    if (!container.current) return;
    const instance = createChart(container.current, {
      autoSize: true, height: 220,
      layout: { background: { color: 'transparent' }, textColor: '#64748b', attributionLogo: false },
      localization: { timeFormatter: timeLabel },
      timeScale: { lockVisibleTimeRangeOnResize: true, timeVisible: true, secondsVisible: false, tickMarkFormatter: timeLabel },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
      crosshair: { mode: CrosshairMode.Normal },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(148,163,184,0.16)' } },
    });
    const hover = (event: { time?: unknown }) => setHovered(typeof event.time === 'number' ? event.time : null);
    const click = (event: { time?: unknown }) => setLocked(typeof event.time === 'number' ? event.time : null);
    instance.subscribeCrosshairMove(hover); instance.subscribeClick(click);
    chart.current = instance;
    return () => {
      instance.unsubscribeCrosshairMove(hover); instance.unsubscribeClick(click);
      instance.remove(); chart.current = null; series.current = [];
    };
  }, []);

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    const visible = instance.timeScale().getVisibleRange();
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
    if (visible && segments.length > 0) instance.timeScale().setVisibleRange(visible);
    else instance.timeScale().fitContent();
  }, [segments, points]);

  useEffect(() => {
    const unlock = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || locked === null) return;
      event.preventDefault(); event.stopPropagation(); setLocked(null); setHovered(null);
    };
    window.addEventListener('keydown', unlock, true);
    return () => window.removeEventListener('keydown', unlock, true);
  }, [locked]);

  let state = '暂无盘中估值';
  if (query.isPending) state = '读取中';
  else if (query.isError) state = '估值读取失败';
  let quality = '';
  if (current?.quality === 'low_coverage') quality = '低覆盖';
  else if (current?.quality === 'partial') quality = '部分覆盖';
  else if (current?.quality === 'unavailable') quality = '估值不可用';

  return (
    <div className="grid min-w-0 gap-2 rounded-lg bg-muted/30 p-3" data-market-nav-chart data-fund-intraday-chart={symbol}>
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onHistory}>历史净值</Button>
        <span className="text-xs text-muted-foreground">今日 · {query.data?.date ?? day.format(new Date())}</span>
        {query.isError ? <span className="text-xs text-muted-foreground" role="status">读取失败</span> : null}
        {query.isError ? <Button type="button" size="sm" variant="link" onClick={() => void query.refetch()}>重试今日估值</Button> : null}
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground" aria-label="盘中估值图例">
        <span>┄ 盘中估值</span><span>━ 正式净值</span>
      </div>
      <div className="relative min-w-0">
        <div ref={container} className="h-[220px] max-h-[220px] min-w-0 overflow-hidden [&_table]:h-auto [&_table]:min-w-0 [&_table]:w-auto [&_td]:min-w-0 [&_td]:p-0" />
        {segments.length === 0 ? <p className="pointer-events-none absolute inset-0 m-0 flex items-center justify-center text-sm text-muted-foreground" role="status">{query.isFetching ? <Spinner aria-label="正在读取盘中走势" /> : state}</p> : null}
      </div>
      <div className="grid min-w-0 gap-1 text-xs text-muted-foreground" data-market-nav-readout role="status">
        <span className="min-w-0 overflow-x-auto whitespace-nowrap tabular-nums">
          盘中估值 {formatMarketNumber(current?.estimatedNav, 'valuation')}
          {current?.changePercent == null ? '' : ` · ${formatPercentValue(current.changePercent, 'always')}`}
        </span>
        <span className="min-w-0 overflow-x-auto whitespace-nowrap tabular-nums">
          {selected ? clock.format(new Date(selected.at)) : '—'}{locked === null ? '' : ' · 已锁定'}{quality ? ` · ${quality}` : ''}
        </span>
      </div>
      <MarketChartAttribution />
    </div>
  );
}
