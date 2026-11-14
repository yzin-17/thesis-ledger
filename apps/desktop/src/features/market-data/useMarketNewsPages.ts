import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { MarketNewsResult, MarketNewsFeedResult } from '@thesis-ledger/schemas';
import { projectMarketNewsPages } from './market-news-pages.js';

type NewsPage = MarketNewsResult | MarketNewsFeedResult;

export function useMarketNewsPages<TInput extends { cursor?: string | null | undefined }, TPage extends NewsPage>(
  key: string,
  input: TInput | null,
  read: (input: TInput, signal: AbortSignal) => Promise<TPage>,
) {
  const client = useQueryClient();
  const queryKey = ['desktop', key, input];
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const result = await read({ ...input!, cursor: pageParam }, signal);
      if (pageParam !== null) {
        if (result.status === 'unavailable') throw new Error('后续新闻读取受限，请重试；若分页已失效，请重新查询。');
        const first = client.getQueryData<InfiniteData<TPage>>(queryKey)?.pages[0];
        if (!first || first.source?.providerId !== result.source?.providerId || first.source?.upstreamSource !== result.source?.upstreamSource) {
          throw new Error('新闻分页来源发生变化，请重新查询。');
        }
      }
      return result;
    },
    getNextPageParam: (last, _pages, _previous, pageParams) => {
      if (!last.nextCursor || pageParams.includes(last.nextCursor)) return undefined;
      return last.nextCursor;
    },
    enabled: input !== null,
    retry: false,
    staleTime: 60_000,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return { ...query, result: projectMarketNewsPages(query.data?.pages ?? []) };
}
