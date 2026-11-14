import { dataSourceDisplay } from '../market-data/market-data.types.js';
import { useQuery } from '@tanstack/react-query';
import type { WatchlistItem, WatchlistPrice } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { useWatchlistPageVisible, useWatchlistRowVisible } from './useWatchlistVisibility.js';
import {
  watchlistSourceCadence,
  sourceNextCheck,
  type CadenceCatalog,
} from './watchlist-source-cadence.js';
import { watchlistTrend, type WatchlistTrend as TrendData } from './watchlist-trend.js';
import { watchlistTrendGeometry } from './watchlist-trend-geometry.js';
import { WatchlistCandles } from './WatchlistCandles.js';

export function WatchlistTrend({
  item,
  catalog,
  snap,
  period,
  queryRoot,
  select,
}: {
  catalog?: CadenceCatalog;
  item: WatchlistItem;
  snap?: WatchlistPrice | undefined;
  period: '1m' | '1d';
  queryRoot: readonly unknown[];
  select: () => void;
}) {
  const { ref, visible } = useWatchlistRowVisible();
  const pageVisible = useWatchlistPageVisible();
  const fund = item.instrument.instrumentType === 'MUTUAL_FUND';
  const minute = !fund && period === '1m';
  const symbol = item.instrument.canonicalCode + '.' + item.instrument.market;
  const cadenceFor = (value: TrendData | undefined) =>
    watchlistSourceCadence(
      item,
      value?.source ? { provider: value.source, upstreamSource: value.upstreamSource } : undefined,
      catalog,
    );
  const query = useQuery({
    queryKey: [...queryRoot, 'trends', symbol, fund ? 'nav' : period],
    queryFn: async ({ signal }): Promise<TrendData> => {
      if (minute) {
        const plan = await getDesktopApiClient().market.getChartOptions(
          symbol,
          signal,
          undefined,
          '1m',
        );
        const option = plan.options.find((entry) => entry.adjustment === 'none');
        if (!option?.available)
          return {
            points: [],
            label: '分时 · 1分钟',
            notice:
              option?.reason === 'route_not_configured'
                ? '未配置分钟行情来源'
                : '当前分钟行情来源不可用',
          };
      }
      // This endpoint validates the source/window; include only the needed series, no indicators.
      const detail = await getDesktopApiClient().market.getDetail(symbol, {
        include: fund ? ['fund-nav-history'] : ['bars'],
        timeframe: fund ? '1d' : period,
        adjustment: minute ? 'none' : 'qfq',
        chartContractVersion: 3,
        barsLimit: minute ? 400 : 20,
        navLimit: 20,
        signal,
      });
      return watchlistTrend(detail, fund, minute);
    },
    enabled: visible && pageVisible && item.instrument.active,
    staleTime: (query) => (cadenceFor(query.state.data)?.seconds ?? Infinity) * 1000,
    refetchInterval: (query) => {
      if (!visible || !pageVisible) return false;
      const cadence = cadenceFor(query.state.data);
      if (!cadence) return false;
      return Math.max(
        1000,
        sourceNextCheck(
          Math.max(query.state.dataUpdatedAt, query.state.errorUpdatedAt),
          cadence.seconds,
          snap,
        ) - Date.now(),
      );
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: (query) => Boolean(cadenceFor(query.state.data)),
    retry: false,
  });
  const data = query.data;
  const points = data?.points ?? [];
  const cadence = cadenceFor(data);
  const { paths, dividers } = watchlistSessionGeometry(snap, points, minute);
  let label = '日线 · 前复权';
  if (fund) label = '近20期净值';
  else if (minute) label = '分时 · 1分钟';
  const state = watchlistTrendState(
    query.isPending,
    query.isFetching,
    query.error,
    data,
    points.length,
  );
  return (
    <div ref={ref} className="min-w-0 text-xs">
      <Button
        variant="ghost"
        onClick={select}
        className="h-auto w-full flex-col items-stretch gap-1 px-0 py-1"
        aria-label={`${item.displayName}，查看完整行情图表`}
      >
        <span className="text-left text-xs font-normal text-muted-foreground">
          {data?.label ?? label}
        </span>
        <WatchlistTrendSeries
          data={data}
          fund={fund}
          minute={minute}
          label={label}
          paths={paths}
          dividers={dividers}
          pointCount={points.length}
        />
        <WatchlistTrendCutoff data={data} minute={minute} />
      </Button>
      {data?.source && !cadence && (
        <span className="block text-muted-foreground">自动走势检查暂停</span>
      )}
      {(query.error || data?.notice || points.length < 2) && (
        <span className="block break-words text-muted-foreground">{state}</span>
      )}
    </div>
  );
}

function watchlistSessionGeometry(
  snap: WatchlistPrice | undefined,
  points: TrendData['points'],
  minute: boolean,
) {
  const session =
    snap?.quoteContext ??
    (snap?.price.kind === 'quote' ? snap.price.quote.sessionContext : undefined);
  const { paths, dividers } = watchlistTrendGeometry(
    points,
    minute,
    session?.marketSession?.sessions,
  );
  return { paths, dividers };
}

function watchlistTrendState(
  isPending: boolean,
  isFetching: boolean,
  error: unknown,
  data: TrendData | undefined,
  pointCount: number,
) {
  let state = '滚动到此处后读取';
  if (isPending && isFetching) state = '正在读取走势';
  else if (error) state = requestFailureMessage(error);
  else if (data?.notice) state = data.notice;
  else if (pointCount < 2) state = '走势数据不足';
  return state;
}

function WatchlistTrendCutoff({ data, minute }: { data: TrendData | undefined; minute: boolean }) {
  return (
    data?.cutoff && (
      <span className="text-left text-xs font-normal text-muted-foreground">
        {data.source && <>{dataSourceDisplay(data.source)} · </>}
        {new Date(data.cutoff).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          ...(minute ? { hour: '2-digit', minute: '2-digit' } : {}),
        })}
      </span>
    )
  );
}

function WatchlistTrendSeries({
  data,
  fund,
  minute,
  label,
  paths,
  dividers,
  pointCount,
}: {
  data: TrendData | undefined;
  fund: boolean;
  minute: boolean;
  label: string;
  paths: string[];
  dividers: number[];
  pointCount: number;
}) {
  return !fund && !minute && data?.candles ? (
    <WatchlistCandles candles={data.candles} />
  ) : (
    paths.length > 0 && (
      <svg
        viewBox="0 0 160 44"
        className="size-full h-11 text-chart-1"
        role="img"
        aria-label={`${label}，${pointCount}个数据点`}
      >
        {dividers.map((x) => (
          <line
            key={x}
            x1={x}
            x2={x}
            y1="3"
            y2="41"
            className="stroke-muted-foreground/50"
            strokeWidth="1"
            strokeDasharray="2 2"
          >
            <title>交易时段间隔</title>
          </line>
        ))}
        {paths.map((d, index) => (
          <path key={index} d={d} fill="none" stroke="currentColor" strokeWidth="1.6" />
        ))}
      </svg>
    )
  );
}
