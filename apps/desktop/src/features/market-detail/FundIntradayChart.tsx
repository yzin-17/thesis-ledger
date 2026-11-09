import { FundIntradayReadout } from './FundIntradayReadout.js';
import { FundIntradayChartCanvas } from './FundIntradayChartCanvas.js';
import { chartOverlayHandlesEscape } from './market-chart-keyboard.js';
import { MarketChartToolbarGroup } from './MarketChartToolbar.js';
import { MarketChartViewActions } from './MarketChartViewActions.js';
import { MarketChartFullscreen, useChartFullscreen } from './MarketChartFullscreen.js';
import { MarketChartViewportController, type ChartViewAction, type ChartViewportSession } from './market-chart-viewport-controller.js';
import { Spinner } from '@/components/ui/spinner';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { MarketChartAttribution } from './MarketChartAttribution.js';
import { fundIntradaySegments } from './fund-intraday-series.js';

const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });

export function FundIntradayChart({ symbol, onHistory, rangeControls }: { symbol: string; onHistory: () => void; rangeControls?: ReactNode }) {
  const query = useQuery({
    queryKey: ['market', 'fund-valuation-today', symbol, day.format(new Date())],
    queryFn: ({ signal }) => getDesktopApiClient().market.getFundValuationToday(symbol, signal),
    staleTime: 15_000, refetchInterval: 60_000, refetchIntervalInBackground: false, retry: false,
  });
  const fullscreen = useChartFullscreen();
  const session = useRef<ChartViewportSession>({ controller: new MarketChartViewportController(), snapshot: null });
  const [reset, setReset] = useState(0), [focus, setFocus] = useState(0);
  const [viewAction, setViewAction] = useState<ChartViewAction>();
  const controls = { range: 0, reset, focus };
  const points = query.data?.points;
  const segments = useMemo(() => fundIntradaySegments(points ?? []), [points]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [locked, setLocked] = useState<number | null>(null);

  useEffect(() => {
    const unlock = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || locked === null || chartOverlayHandlesEscape(event.target)) return;
      event.preventDefault(); event.stopPropagation(); setLocked(null); setHovered(null);
    };
    window.addEventListener('keydown', unlock, true);
    return () => window.removeEventListener('keydown', unlock, true);
  }, [locked]);

  let state = '暂无盘中估值';
  if (query.isPending) state = '读取中';
  else if (query.isError) state = '估值读取失败';
  const panel = (
    <div className="grid min-w-0 gap-2 rounded-lg bg-muted/30 p-3" data-market-nav-chart data-fund-intraday-chart={symbol}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        {rangeControls ?? <Button type="button" size="sm" variant="ghost" onClick={onHistory}>历史净值</Button>}
        <MarketChartToolbarGroup label="视图">
          <MarketChartViewActions expanded={fullscreen.expanded} fullscreenTrigger={fullscreen.trigger}
            onToggleExpanded={() => fullscreen.setExpanded((value) => !value)}
            onLatest={() => { setLocked(null); setHovered(null); setFocus((value) => value + 1); }}
            onReset={() => { setLocked(null); setHovered(null); setReset((value) => value + 1); }}
            onNavigate={(type) => setViewAction((current) => ({ type, revision: (current?.revision ?? 0) + 1 }))} />
        </MarketChartToolbarGroup>
      </div>
      <div className="flex min-h-8 flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>今日 · {query.data?.date ?? day.format(new Date())}</span>
        {query.isError && <><span role="status">读取失败</span><Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>重试今日估值</Button></>}
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground" aria-label="盘中估值图例">
        <span>┄ 盘中估值</span><span>━ 正式净值</span>
      </div>
      <div className="relative min-w-0">
        <FundIntradayChartCanvas points={points} segments={segments} scope={symbol + ':' + (query.data?.date ?? '')}
          expanded={fullscreen.expanded} controls={controls} viewAction={viewAction} session={session} onHover={setHovered} onClick={setLocked} />
        {segments.length === 0 ? <p className="pointer-events-none absolute inset-0 m-0 flex items-center justify-center text-sm text-muted-foreground" role="status">{query.isFetching ? <Spinner aria-label="正在读取盘中走势" /> : state}</p> : null}
      </div>
      <FundIntradayReadout points={points} selectedTime={locked ?? hovered} locked={locked !== null} />
      <MarketChartAttribution />
    </div>
  );
  return <MarketChartFullscreen expanded={fullscreen.expanded} onOpenChange={fullscreen.setExpanded} title="基金盘中估值">
    {panel}
  </MarketChartFullscreen>;
}
