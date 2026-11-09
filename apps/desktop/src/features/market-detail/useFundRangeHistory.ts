import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { FundNavHistory } from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { chartDateInterval, type ChartRange } from './chart-date-range.js';

export function useFundRangeHistory(source: FundNavHistory, range: ChartRange) {
  const symbol = source[0]?.symbol;
  const first = source[0]?.navDate.slice(0, 10);
  const last = source.at(-1)?.navDate.slice(0, 10);
  const interval = last ? chartDateInterval(range, last) : null;
  const client = useQueryClient();
  const cached = client.getQueriesData<FundNavHistory>({ queryKey: ['desktop', 'fund-chart-range', symbol],
    predicate: (query) => Date.now() - query.state.dataUpdatedAt < 60_000 })
    .map(([, points]) => points).find((points) => interval && points?.length &&
      points[0]!.navDate.slice(0, 10) <= interval.from && points.at(-1)!.navDate.slice(0, 10) >= interval.to);
  const needsHistory = range !== 1 && Boolean(interval && first && last &&
    (interval.from < first || interval.to > last));
  const query = useQuery({
    queryKey: ['desktop', 'fund-chart-range', symbol, interval?.from, interval?.to],
    queryFn: ({ signal }) => {
      if (!symbol || !interval) throw new Error('缺少基金代码或日期区间');
      return getDesktopApiClient().market.getFundNavHistory(symbol,
        { start: interval.from, end: interval.to, limit: 3650 }, signal);
    },
    enabled: needsHistory && !cached,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[2] === symbol ? previous : undefined,
    staleTime: 60_000,
    retry: false,
  });
  const history = useMemo(() => {
    const dates = new Map<string, FundNavHistory[number]>();
    for (const point of [...(cached ?? []), ...source, ...(query.data ?? [])]) {
      const date = point.navDate.slice(0, 10), previous = dates.get(date);
      if (!previous || point.fetchedAt >= previous.fetchedAt) dates.set(date, point);
    }
    return [...dates.values()].sort((a, b) => a.navDate.localeCompare(b.navDate));
  }, [source, query.data, cached]);
  let notice = '';
  if (query.isError) notice = '所选区间净值读取失败，已保留当前净值。';
  else if (!query.isFetching && interval) {
    const points = history.filter((point) => interval.from <= point.navDate.slice(0, 10) && point.navDate.slice(0, 10) <= interval.to);
    if (!points.length) notice = '';
    else if (history[0]!.navDate.slice(0, 10) > interval.from || history.at(-1)!.navDate.slice(0, 10) < interval.to)
      notice = `所选区间数据未完全覆盖，当前净值为 ${history[0]!.navDate.slice(0, 10)} 至 ${history.at(-1)!.navDate.slice(0, 10)}。`;
  }
  return { history, loading: query.isFetching, error: query.isError, notice, retry: () => void query.refetch() };
}
