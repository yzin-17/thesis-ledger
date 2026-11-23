import { useEffect, useRef, useState } from 'react';
import { createChart, LineSeries, createSeriesMarkers, type UTCTimestamp, type Time } from 'lightweight-charts';
import { arenaDateAt, arenaWindowDate, arenaSeriesColors, formatDecimalNumber, arenaRatio, type ArenaChartPeriod } from '@thesis-ledger/domain';
import type { ArenaLiveDetail } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';
import { formatDateTimeInTimeZone } from '@/lib/date-display';
import { restoreArenaLiveViewport, useArenaLiveClock, useArenaLiveHeight } from './useArenaLiveViewport.js';

export function ArenaLiveChart({ detail, onSelectAgent }: { detail: ArenaLiveDetail; onSelectAgent: (id: string) => void }) {
  const [period, setPeriod] = useState<ArenaChartPeriod>('all'), [nav, setNav] = useState(false), [trades, setTrades] = useState(false);
  const [selected, setSelected] = useState<{ at: string; x: number; y: number } | null>(null), [theme, setTheme] = useState(0);
  const [hidden, setHidden] = useState<string[]>([]);
  const container = useRef<HTMLDivElement>(null), instance = useRef<ReturnType<typeof createChart> | null>(null);
  const lastRange = useRef<string>('');
  const savedRange = useRef<{ from: Time; to: Time } | null>(null);
  const following = useRef(true);
  const drawing = useRef(false), releaseDrawing = useRef(0), lastClock = useRef<number | null>(null);
  const clock = useArenaLiveClock(detail);
  const timeZone = detail.protocol.timeZone;
  const cutoff = arenaWindowDate(period, new Date((clock ?? Date.now() / 1000) * 1000).toISOString(), timeZone);
  const frames = detail.frames.filter((f) => arenaDateAt(f.at, timeZone) >= cutoff);
  const start = frames.length ? Math.floor(Date.parse(frames[0]!.at) / 1000) as UTCTimestamp : undefined;
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme((t) => t + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, { autoSize: true, height: container.current.clientHeight,
      layout: { background: { color: 'transparent' }, textColor: '#64748b', attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(148,163,184,0.16)' } },
      timeScale: { timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: false }, handleScale: { mouseWheel: false },
    });
    instance.current = chart;
    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (!range || drawing.current) return;
      savedRange.current = range;
      following.current = !lastClock.current || (typeof range.to === 'number' && range.to >= lastClock.current);
    });
    chart.subscribeCrosshairMove((p) => setSelected(typeof p.time === 'number' && p.point && container.current
      ? { at: new Date(p.time * 1000).toISOString(), x: p.point.x > container.current.clientWidth / 2 ? 8 : Math.max(8, container.current.clientWidth - 360), y: 8 } : null));
    return () => { cancelAnimationFrame(releaseDrawing.current); chart.remove(); instance.current = null; };
  }, []);
  useArenaLiveHeight(container, instance);
  useEffect(() => {
    const chart = instance.current;
    if (!chart) return;
    const previousRange = savedRange.current;
    drawing.current = true;
    cancelAnimationFrame(releaseDrawing.current);
    lastClock.current = clock;
    const css = getComputedStyle(document.documentElement);
    chart.applyOptions({ layout: { textColor: css.getPropertyValue('--muted-foreground').trim() || '#64748b' },
      timeScale: { tickMarkFormatter: (t: Time, type: number) => typeof t === 'number' ? new Date(t * 1000).toLocaleString('zh-CN', {
        timeZone, ...(type >= 3 ? { hour: '2-digit', minute: '2-digit', hour12: false } : { month: 'numeric', day: 'numeric' }),
      }) : '' },
      localization: { timeFormatter: (t: Time) => typeof t === 'number' ? formatDateTimeInTimeZone(t * 1000, timeZone) : '' } });
    const added: ReturnType<typeof chart.addSeries>[] = [];
    const rows = [...detail.agents.map((a, index) => ({ id: a.id, title: a.model, color: arenaSeriesColors[index % arenaSeriesColors.length]!, baseline: false, fills: a.account.fills })),
      ...detail.protocol.benchmarks.map((id, index) => ({ id, title: id === 'cash' ? '现金基准' : '固定篮子', color: index ? '#78716c' : '#94a3b8', baseline: true, fills: [] }))];
    for (const row of rows.filter((r) => !hidden.includes(r.id))) {
      let segment: { time: UTCTimestamp; value: number }[] = [];
      const draw = () => {
        if (!segment.length) return;
        const series = chart.addSeries(LineSeries, { color: row.color, lineWidth: row.baseline ? 1 : 2,
          pointMarkersVisible: segment.length === 1, lastValueVisible: false, priceLineVisible: false,
          priceFormat: { type: 'custom', formatter: (v: number) => nav ? formatDecimalNumber(String(v)) : v.toFixed(2) + '%' } });
        series.setData(segment); added.push(series);
        if (trades && row.fills.length) {
          const markers = row.fills.flatMap((fill) => {
            const point = segment.find((s) => s.time * 1000 >= Date.parse(fill.recordedAt));
            if (!point || Date.parse(fill.recordedAt) < segment[0]!.time * 1000 - detail.protocol.resources.quoteIntervalSeconds * 1000) return [];
            return [{ time: point.time, position: fill.side === 'buy' ? 'belowBar' as const : 'aboveBar' as const,
              shape: fill.side === 'buy' ? 'arrowUp' as const : 'arrowDown' as const, color: row.color, text: fill.side === 'buy' ? '买' : '卖' }];
          }).sort((a, b) => a.time - b.time);
          createSeriesMarkers(series, markers);
        }
        segment = [];
      };
      const unique = [...new Map(frames.map((f) => [Math.floor(Date.parse(f.at) / 1000), f])).entries()];
      for (const [seconds, frame] of unique) {
        if (frame.gapBefore.includes((row.baseline ? 'baseline:' : 'agent:') + row.id)) draw();
        const mark = row.baseline ? frame.benchmarks.find((m) => m.id === row.id) : frame.marks.find((m) => m.agentId === row.id);
        const raw = nav ? mark?.nav : mark?.returnRatio;
        if (raw == null) { draw(); continue; }
        segment.push({ time: seconds as UTCTimestamp, value: Number(raw) * (nav ? 1 : 100) });
      }
      draw();
    }
    if (clock && frames.length) {
      const axis = chart.addSeries(LineSeries, { visible: false, lastValueVisible: false, priceLineVisible: false });
      axis.setData([{ time: Math.floor(Date.parse(frames[0]!.at) / 1000) as UTCTimestamp }, ...(clock > Date.parse(frames[0]!.at) / 1000 ? [{ time: clock }] : [])]);
      added.push(axis);
    }
    const key = detail.id + ':' + period;
    savedRange.current = restoreArenaLiveViewport(chart, lastRange.current === key ? previousRange : null, lastRange.current !== key || following.current, clock, start);
    releaseDrawing.current = requestAnimationFrame(() => { drawing.current = false; });
    lastRange.current = key;
    return () => {
      if (instance.current !== chart) return;
      drawing.current = true;
      for (const series of added) chart.removeSeries(series);
    };
  }, [detail, period, nav, trades, theme, hidden, clock, start]);
  const active = frames.find((f) => Math.floor(Date.parse(f.at) / 1000) === Math.floor(Date.parse(selected?.at ?? '') / 1000));
  return <section className="grid min-w-0 grid-cols-1 gap-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{nav ? '账户净值' : '赛季累计收益'}</h2>
      <div className="flex flex-wrap gap-1">{([['today', '今日'], ['week', '近一周'], ['month', '近一月'], ['all', '全部']] as const).map(([value, label]) =>
        <Button size="sm" key={value} variant={period === value ? 'secondary' : 'outline'} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</Button>)}
        <Button size="sm" variant="outline" aria-pressed={nav} onClick={() => setNav(!nav)}>{nav ? '查看收益率' : '查看净值'}</Button>
        <Button size="sm" variant="outline" aria-pressed={trades} onClick={() => setTrades(!trades)}>成交标记</Button>
        <Button size="sm" variant="outline" onClick={() => { following.current = true; if (instance.current) restoreArenaLiveViewport(instance.current, instance.current.timeScale().getVisibleRange(), true, clock, start); }}>回到最新</Button></div></div>
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">{[...detail.agents.map((a, i) => ({ id: a.id, title: a.model, color: arenaSeriesColors[i % arenaSeriesColors.length]!, model: true })),
      ...detail.protocol.benchmarks.map((id, i) => ({ id, title: id === 'cash' ? '现金基准' : '固定篮子', color: i ? '#78716c' : '#94a3b8', model: false }))].map((a) => <span key={a.id} className="inline-flex min-w-0 max-w-full items-center gap-1">
        <span className="h-0.5 w-4 shrink-0" style={{ backgroundColor: a.color }} />
        {a.model ? <Button size="sm" variant="ghost" className="h-auto min-w-0 max-w-80 shrink justify-start border-0 p-0" title={a.title} onClick={() => onSelectAgent(a.id)}><span className="truncate">{a.title}</span></Button> : <span>{a.title}</span>}
        <Button size="icon-sm" variant="ghost" aria-label={(hidden.includes(a.id) ? '显示 ' : '隐藏 ') + a.title} aria-pressed={!hidden.includes(a.id)}
          onClick={() => setHidden(hidden.includes(a.id) ? hidden.filter((id) => id !== a.id) : [...hidden, a.id])}>{hidden.includes(a.id) ? <EyeOff /> : <Eye />}</Button></span>)}</div>
    <div className="relative min-w-0" onMouseLeave={() => setSelected(null)}><div ref={container} className="h-[440px] w-full min-w-0 overflow-hidden sm:h-[clamp(520px,68vh,720px)] [&_table]:w-auto [&_td]:p-0" role="img" aria-label="各参赛模型的赛季累计收益和净值曲线" />
      {active && selected && <div role="status" className="pointer-events-none absolute grid w-72 max-w-[calc(100%-5rem)] gap-1 rounded-md bg-popover p-3 text-xs text-popover-foreground shadow-md" style={{ left: selected.x, top: selected.y }}><span className="text-muted-foreground">{formatDateTimeInTimeZone(active.at, timeZone)}</span>{active.marks.filter((m) => !hidden.includes(m.agentId)).map((m) => <div key={m.agentId} className="flex min-w-0 justify-between gap-3"><span className="truncate">{detail.agents.find((a) => a.id === m.agentId)?.model}</span><span className="shrink-0 tabular-nums">{nav ? m.nav ?? '未估值' : arenaRatio(m.returnRatio)}</span></div>)}</div>}
      {!frames.length && <div className="pointer-events-none absolute inset-0 grid place-content-center text-sm text-muted-foreground">{detail.state === 'draft' ? '比赛启动后显示收益曲线' : '此范围暂无合格估值'}</div>}</div>
    <p className="text-xs text-muted-foreground">收益从赛季本金起算，时间筛选只裁剪曲线。缺少合格价格时保留断线。{detail.protocol.currency} · {timeZone}</p>
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs wrap-anywhere"><span className="text-muted-foreground">所选区间收益</span>{detail.periodReturns.find((r) => r.period === period)?.rows.map((r) => <span key={r.agentId}>{detail.agents.find((a) => a.id === r.agentId)?.model} · {arenaRatio(r.returnRatio)}</span>)}</div>
  </section>;
}
