import { useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isMarketMinuteTimeframe, type MarketSession } from '@thesis-ledger/schemas';
import { requestMarketDetail } from './market-detail.api.js';
import {
  latestDetailQueryKey,
  type UseMarketChartLatestRefreshOptions,
  type useMarketChartLatestRefresh,
} from './useMarketChartLatestRefresh.js';

const REFRESH_MS = 60_000;
const subscribeVisibility = (notify: () => void) => {
  document.addEventListener('visibilitychange', notify);
  return () => document.removeEventListener('visibilitychange', notify);
};

// 用服务端给出的边界相对检查时间计算有效期，避免浏览器时区或时钟偏差改变交易日归属。
export function minuteSessionIsOpen(
  session: MarketSession | null | undefined,
  checkedAt: number,
  now = Date.now(),
) {
  if (session?.state !== 'open' || session.tradingDayState !== 'open') return false;
  const elapsed = now - checkedAt;
  if (elapsed < 0 || elapsed >= 90_000) return false;
  const remaining = Date.parse(session.nextBoundaryAt ?? '') - Date.parse(session.evaluatedAt);
  return Number.isFinite(remaining) && remaining > elapsed;
}

type Options = Pick<
  UseMarketChartLatestRefreshOptions,
  'symbol' | 'refreshSequence' | 'indicatorParams' | 'adjustment' | 'chartWindowV3'
> & {
  enabled: boolean;
  latestRefresh: ReturnType<typeof useMarketChartLatestRefresh>;
};

export function useMarketDetailQuery({
  symbol,
  refreshSequence,
  indicatorParams,
  adjustment,
  chartWindowV3,
  enabled,
  latestRefresh,
}: Options) {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const visible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== 'hidden',
    () => false,
  );
  const minute = isMarketMinuteTimeframe(chartWindowV3.timeframe);
  const liveWindow = autoRefresh && minute && enabled;
  const session = useQuery({
    queryKey: ['desktop', 'market-minute-session', symbol],
    queryFn: async ({ signal }) => {
      const checkedAt = Date.now();
      const response = await requestMarketDetail({ symbol, include: ['quote'] }, signal);
      const quote = response.sections.quote;
      const value =
        quote?.capability === 'quote' ? quote.data?.sessionContext?.marketSession : null;
      return { value, checkedAt };
    },
    enabled: liveWindow && visible,
    staleTime: 0,
    retry: false,
    refetchInterval: liveWindow && visible ? REFRESH_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
  });
  const canRefresh = () =>
    liveWindow &&
    visible &&
    !session.isError &&
    minuteSessionIsOpen(session.data?.value, session.data?.checkedAt ?? 0);
  useQuery({
    queryKey: [
      'desktop',
      'market-detail-auto',
      symbol,
      chartWindowV3.timeframe,
      adjustment ?? null,
      indicatorParams,
      chartWindowV3.barsLimit,
    ],
    queryFn: async () => {
      await latestRefresh.loadLater({ force: true });
      return Date.now();
    },
    enabled: canRefresh() && !latestRefresh.latestLoading && !latestRefresh.retrying,
    staleTime: REFRESH_MS,
    retry: false,
    refetchInterval: canRefresh() ? REFRESH_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: () => canRefresh(),
  });
  const query = useQuery({
    queryKey: latestDetailQueryKey(
      symbol,
      refreshSequence,
      indicatorParams,
      adjustment,
      chartWindowV3,
    ),
    queryFn: latestRefresh.queryFn,
    enabled,
    staleTime: 15_000,
    retry: false,
    // 详情挂载即使命中 fresh cache 也检查最新；缓存负责先展示。
    refetchOnMount: 'always',
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: !minute,
  });
  return { ...query, autoRefresh, setAutoRefresh };
}
