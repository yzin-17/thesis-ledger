import { cn } from '@/lib/utils';
import { dataSourceDisplay } from '../market-data/market-data.types.js';
import { useQuery } from '@tanstack/react-query';
import type { WatchlistItem, WatchlistPrice } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { marketToneClass, marketToneForValue } from '../../ui/market-color.js';
import { useWatchlistPageVisible, useWatchlistRowVisible } from './useWatchlistVisibility.js';
import {
  watchlistSourceCadence,
  sourceNextCheck,
  type CadenceCatalog,
} from './watchlist-source-cadence.js';
import { trendPaths, watchlistTrend, type WatchlistTrend as TrendData } from './watchlist-trend.js';

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
                ? '未配置分时来源，可切换近20交易日'
                : '当前分时来源不可用，可切换近20交易日',
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
  const paths = trendPaths(points, minute);
  const delta = points.length > 1 ? points.at(-1)!.value - points[0]!.value : undefined;
  let label = '近20交易日 · 前复权';
  if (fund) label = '近20期净值';
  else if (minute) label = '分时 · 1分钟';
  let state = '滚动到此处后读取';
  if (query.isPending && query.isFetching) state = '正在读取走势';
  else if (query.error) state = requestFailureMessage(query.error);
  else if (data?.notice) state = data.notice;
  else if (points.length < 2) state = '走势数据不足';
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
        {paths.length > 0 && (
          <svg
            viewBox="0 0 160 44"
            className={cn(
              'size-full h-11',
              marketToneClass(marketToneForValue(delta)) ?? 'text-foreground',
            )}
            role="img"
            aria-label={`${label}，${points.length}个数据点`}
          >
            {paths.map((d, index) => (
              <path key={index} d={d} fill="none" stroke="currentColor" strokeWidth="1.6" />
            ))}
          </svg>
        )}
        {data?.source && (
          <span className="text-left text-xs font-normal text-muted-foreground">
            {dataSourceDisplay(data.source)}
          </span>
        )}
        {data?.cutoff && (
          <span className="text-left text-xs font-normal text-muted-foreground">
            截至{' '}
            {new Date(data.cutoff).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              ...(minute ? { hour: '2-digit', minute: '2-digit' } : {}),
            })}
          </span>
        )}
      </Button>
      {data?.source && (
        <span className="block text-muted-foreground">
          {cadence ? `检查基准：来源${cadence.label}` : '来源周期待确认，自动走势检查暂停'}
        </span>
      )}
      {(query.error || data?.notice || points.length < 2) && (
        <span className="block break-words text-muted-foreground">{state}</span>
      )}
    </div>
  );
}
