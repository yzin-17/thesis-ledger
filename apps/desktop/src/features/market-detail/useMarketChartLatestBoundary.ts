import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { MarketDetailResponseV2 } from '@thesis-ledger/api-client';
import { requestMarketDetail } from './market-detail.api.js';
import { barDatesAfter, hasLatestPointChanges } from './market-chart-latest-window.js';
import { buildChartPoints, type ChartPoint } from './market-chart-model.js';
import { chartPageFromResponse } from './market-chart-types.js';
import type { MarketIndicatorParams } from './MarketDetailCharts.js';
import type {
  ActiveRequestToken,
  RequestLifecycle,
} from './market-chart-refresh-lifecycle.js';

const LATEST_PROBE_COOLDOWN_MS = 60_000;

export type LatestPage = {
  key: string;
  paramsKey: string;
  start: string;
  response: MarketDetailResponseV2;
};

export const latestDetailQueryKey = (
  symbol: string,
  refreshSequence: number,
  indicatorParams: MarketIndicatorParams,
  historyEnd?: string,
  calculationAnchor?: string,
) =>
  [
    'desktop',
    'market-detail',
    symbol,
    refreshSequence,
    indicatorParams,
    historyEnd ?? null,
    calculationAnchor ?? null,
  ] as const;

export type LatestBoundaryOptions = {
  queryClient: QueryClient;
  symbol: string;
  refreshSequence: number;
  historyEnd?: string | undefined;
  indicatorParams: MarketIndicatorParams;
  paramsKey: string;
  chartPointsRef: MutableRefObject<ChartPoint[]>;
  requestGeneration: number;
  lifecycle: RequestLifecycle;
  onLatestDetail: (response: MarketDetailResponseV2) => void;
};

export type OpeningLatestState = {
  refresh: boolean;
  latestCheck: boolean;
};

export function useMarketChartLatestBoundary({
  queryClient,
  symbol,
  refreshSequence,
  historyEnd,
  indicatorParams,
  paramsKey,
  chartPointsRef,
  requestGeneration,
  lifecycle,
  onLatestDetail,
}: LatestBoundaryOptions) {
  const [laterPages, setLaterPages] = useState<LatestPage[]>([]);
  const [latestLoading, setLatestLoading] = useState(false);
  const [latestNotice, setLatestNotice] = useState<string | null>(null);
  const [latestError, setLatestError] = useState<string | null>(null);
  const latestProbeRef = useRef<{ baseline: string; at: number } | null>(null);
  const latestQueryKeyRef = useRef<readonly unknown[] | null>(null);
  const latestRequestTokenRef = useRef<ActiveRequestToken | null>(null);
  const openingRefreshSymbolRef = useRef<string | null>(null);
  const pendingRefreshSequenceRef = useRef<number | null>(null);
  const boundaryRevisionRef = useRef(0);

  const openingState = (): OpeningLatestState => {
    const openingRefresh = historyEnd === undefined && openingRefreshSymbolRef.current !== symbol;
    if (openingRefresh) openingRefreshSymbolRef.current = symbol;
    const refresh = pendingRefreshSequenceRef.current === refreshSequence || openingRefresh;
    if (refresh) pendingRefreshSequenceRef.current = null;
    return { refresh, latestCheck: historyEnd === undefined && refresh };
  };
  const startOpeningLatest = (
    queryKey: readonly unknown[],
    cachedDetail: MarketDetailResponseV2 | null,
    attemptStartedAt: number,
    token: ActiveRequestToken,
    latestCheck: boolean,
  ) => {
    if (!latestCheck) return;
    latestRequestTokenRef.current = token;
    latestQueryKeyRef.current = queryKey;
    const cachedBaseline = cachedDetail?.barSeries?.points.at(-1)?.timestamp.slice(0, 10);
    if (cachedBaseline) latestProbeRef.current = { baseline: cachedBaseline, at: attemptStartedAt };
    setLatestLoading(true);
  };
  const finishOpeningLatest = (
    queryKey: readonly unknown[],
    token: ActiveRequestToken,
    latestCheck: boolean,
    active: boolean,
  ) => {
    if (latestCheck && active && latestQueryKeyRef.current === queryKey) {
      latestQueryKeyRef.current = null;
      setLatestLoading(false);
    }
    if (latestRequestTokenRef.current?.id === token.id) latestRequestTokenRef.current = null;
  };
  const completeOpeningLatest = (
    response: MarketDetailResponseV2,
    attemptStartedAt: number,
    latestCheck: boolean,
  ) => {
    if (!latestCheck) return;
    const latestDate =
      response.barSeries?.coverage.actualEnd?.slice(0, 10) ??
      response.barSeries?.points.at(-1)?.timestamp.slice(0, 10);
    if (latestDate) latestProbeRef.current = { baseline: latestDate, at: attemptStartedAt };
  };
  const cancelLatest = () => {
    const queryKey = latestQueryKeyRef.current;
    if (queryKey) void queryClient.cancelQueries({ queryKey });
    latestQueryKeyRef.current = null;
    if (latestRequestTokenRef.current) {
      lifecycle.finishRequest(latestRequestTokenRef.current);
      latestRequestTokenRef.current = null;
    }
    setLatestLoading(false);
  };

  useEffect(() => {
    boundaryRevisionRef.current += 1;
    openingRefreshSymbolRef.current = null;
    pendingRefreshSequenceRef.current = null;
    latestProbeRef.current = null;
    setLaterPages([]);
    setLatestLoading(false);
    setLatestNotice(null);
    setLatestError(null);
    return () => {
      const cleanupRevision = ++boundaryRevisionRef.current;
      queueMicrotask(() => {
        if (boundaryRevisionRef.current !== cleanupRevision) return;
        const queryKey = latestQueryKeyRef.current;
        latestQueryKeyRef.current = null;
        if (queryKey) void queryClient.cancelQueries({ queryKey });
      });
    };
  }, [queryClient, symbol]);

  const loadLater = (options: { force?: boolean } = {}) => {
    if (latestQueryKeyRef.current) return;
    const baseline = chartPointsRef.current.at(-1)?.date;
    if (!baseline) return;
    const probed = latestProbeRef.current;
    if (!options.force && probed?.baseline === baseline && Date.now() - probed.at < LATEST_PROBE_COOLDOWN_MS)
      return;
    const generation = requestGeneration;
    const queryKey = ['desktop', 'market-detail', symbol, 'latest', paramsKey, baseline] as const;
    const requestToken = lifecycle.beginRequest();
    latestRequestTokenRef.current = requestToken;
    latestQueryKeyRef.current = queryKey;
    latestProbeRef.current = { baseline, at: Date.now() };
    setLatestLoading(true);
    setLatestError(null);
    setLatestNotice(null);
    void queryClient
      .fetchQuery({
        queryKey,
        queryFn: ({ signal }) =>
          requestMarketDetail(
            {
              symbol,
              include: ['bars', 'indicator:MA', 'indicator:MACD', 'indicator:RSI'],
              barsLimit: 90,
              navLimit: 90,
              indicatorParams,
              start: baseline,
              refresh: true,
            },
            signal,
          ),
        staleTime: 0,
        retry: false,
      })
      .then((next) => {
        if (!lifecycle.requestIsCurrent(requestToken, generation, symbol)) return;
        const nextPage = chartPageFromResponse(next);
        const nextPoints = nextPage ? buildChartPoints(nextPage.bars, nextPage.indicators) : [];
        const changed = hasLatestPointChanges(chartPointsRef.current, nextPoints, baseline);
        const added = barDatesAfter(next.barSeries?.points ?? [], baseline);
        const latestDate =
          next.barSeries?.coverage.actualEnd?.slice(0, 10) ??
          next.barSeries?.points.at(-1)?.timestamp.slice(0, 10);
        const notice = latestDate ? `，截止 ${latestDate}。` : '。';
        onLatestDetail(next);
        setLaterPages((current) => [
          { key: `later:${baseline}`, paramsKey, start: baseline, response: next },
          ...current.filter((page) => !(page.paramsKey === paramsKey && page.start === baseline)),
        ]);
        if (added.length > 0) setLatestNotice(`已补充 ${added.length} 根更新日线${notice}`);
        else if (changed) setLatestNotice(`已更新最新日线${notice}`);
        else setLatestNotice(`本次未发现更新数据${notice}`);
      })
      .catch((error: unknown) => {
        if (!lifecycle.requestIsCurrent(requestToken, generation, symbol)) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (latestQueryKeyRef.current !== queryKey) return;
        setLatestError('检查更新日线失败，当前图表已保留。');
      })
      .finally(() => {
        const active = lifecycle.requestIsCurrent(requestToken, generation, symbol);
        if (active && latestQueryKeyRef.current === queryKey) {
          latestQueryKeyRef.current = null;
          setLatestLoading(false);
        }
        if (latestRequestTokenRef.current?.id === requestToken.id)
          latestRequestTokenRef.current = null;
        lifecycle.finishRequest(requestToken);
      });
  };

  const resetForIndicatorParams = () => {
    cancelLatest();
    latestProbeRef.current = null;
    setLatestNotice(null);
    setLatestError(null);
    setLaterPages([]);
  };
  const markRefreshSequence = (next: number) => {
    pendingRefreshSequenceRef.current = next;
  };

  return {
    laterPages,
    latestLoading,
    latestNotice,
    latestError,
    latestQueryKeyRef,
    loadLater,
    retryLater: () => loadLater({ force: true }),
    cancelLatest,
    resetForIndicatorParams,
    markRefreshSequence,
    openingState,
    startOpeningLatest,
    finishOpeningLatest,
    completeOpeningLatest,
  };
}
