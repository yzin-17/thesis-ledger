import { useRef, useState, type MutableRefObject } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { MarketDetailCapability, MarketDetailResponseV2 } from '@thesis-ledger/api-client';
import type { IndicatorResultV2 } from '@thesis-ledger/schemas';
import { requestMarketDetail } from './market-detail.api.js';
import {
  latestDetailQueryKey,
  useMarketChartLatestBoundary,
} from './useMarketChartLatestBoundary.js';
import {
  useMarketChartRefreshLifecycle,
  type ActiveRequestToken,
} from './market-chart-refresh-lifecycle.js';
import type { ChartPoint } from './market-chart-model.js';
import type { MarketIndicatorParams } from './MarketDetailCharts.js';
import { marketDetailSectionTitle } from './market-detail.types.js';

export type LatestRefreshQueryContext = {
  signal: AbortSignal;
};

export type UseMarketChartLatestRefreshOptions = {
  queryClient: QueryClient;
  symbol: string;
  refreshSequence: number;
  historyEnd?: string | undefined;
  historyCalculationAnchor?: string | undefined;
  indicatorParams: MarketIndicatorParams;
  paramsKey: string;
  detail: MarketDetailResponseV2 | null;
  chartPointsRef: MutableRefObject<ChartPoint[]>;
  requestGeneration: number;
  onLatestDetail: (response: MarketDetailResponseV2) => void;
  onSectionRetry: (
    response: MarketDetailResponseV2,
    capability: MarketDetailCapability,
    end: string | undefined,
    paramsKey: string,
  ) => void;
};

export const responseMatchesIndicatorParams = (
  response: MarketDetailResponseV2,
  params: MarketIndicatorParams,
) => {
  const data = response.sections['indicator:MACD']?.data as IndicatorResultV2 | undefined;
  if (!data) return true;
  return Object.entries(params).every(([name, value]) => {
    const actual = data.parameters[name];
    return actual === undefined || actual === value;
  });
};

export { latestDetailQueryKey };

const expiredRequest = () => new DOMException('行情请求已过期', 'AbortError');

export function useMarketChartLatestRefresh(options: UseMarketChartLatestRefreshOptions) {
  const {
    queryClient,
    symbol,
    refreshSequence,
    historyEnd,
    historyCalculationAnchor,
    indicatorParams,
    paramsKey,
    detail,
    chartPointsRef,
    requestGeneration,
    onLatestDetail,
    onSectionRetry,
  } = options;
  const lifecycle = useMarketChartRefreshLifecycle(symbol, requestGeneration);
  const boundary = useMarketChartLatestBoundary({
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
  });
  const queryResponseGenerationRef = useRef(new Map<string, number>());
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const retryQueryKeysRef = useRef<Array<readonly unknown[]>>([]);
  const retryRequestTokensRef = useRef(new Set<ActiveRequestToken>());

  const queryFn = async ({ signal }: LatestRefreshQueryContext) => {
    const queryKey = latestDetailQueryKey(
      symbol,
      refreshSequence,
      indicatorParams,
      historyEnd,
      historyCalculationAnchor,
    );
    const { refresh, latestCheck } = boundary.openingState();
    const attemptStartedAt = Date.now();
    const requestToken = lifecycle.beginRequest();
    boundary.startOpeningLatest(queryKey, detail, attemptStartedAt, requestToken, latestCheck);
    try {
      const response = await requestMarketDetail(
        {
          symbol,
          ...(historyEnd
            ? { include: ['bars', 'indicator:MA', 'indicator:MACD', 'indicator:RSI'] as const }
            : {}),
          barsLimit: 90,
          navLimit: 90,
          indicatorParams,
          ...(historyEnd ? { end: historyEnd } : {}),
          ...(historyCalculationAnchor ? { calculationAnchor: historyCalculationAnchor } : {}),
          ...(refresh ? { refresh: true } : {}),
        },
        signal,
      );
      if (!lifecycle.requestIsCurrent(requestToken, requestGeneration, symbol))
        throw expiredRequest();
      queryResponseGenerationRef.current.set(response.requestId, requestGeneration);
      boundary.completeOpeningLatest(response, attemptStartedAt, latestCheck);
      return response;
    } finally {
      boundary.finishOpeningLatest(
        queryKey,
        requestToken,
        latestCheck,
        lifecycle.requestIsCurrent(requestToken, requestGeneration, symbol),
      );
      lifecycle.finishRequest(requestToken);
    }
  };

  const retrySection = async (capability: MarketDetailCapability) => {
    const end = historyEnd;
    const queryKey = [
      'desktop',
      'market-detail',
      symbol,
      'section',
      capability,
      paramsKey,
      end ?? null,
    ] as const;
    const requestToken = lifecycle.beginRequest();
    retryQueryKeysRef.current.push(queryKey);
    retryRequestTokensRef.current.add(requestToken);
    setRetrying(capability);
    setRetryError(null);
    try {
      const next = await queryClient.fetchQuery({
        queryKey,
        queryFn: ({ signal }) =>
          requestMarketDetail(
            {
              symbol,
              include: [capability],
              barsLimit: 90,
              navLimit: 90,
              indicatorParams,
              ...(end ? { end } : {}),
              refresh: true,
            },
            signal,
          ),
        staleTime: 0,
      });
      if (
        lifecycle.requestIsCurrent(requestToken, requestGeneration, symbol) &&
        next.symbol === symbol &&
        responseMatchesIndicatorParams(next, indicatorParams)
      )
        onSectionRetry(next, capability, end, paramsKey);
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      if (
        lifecycle.requestIsCurrent(requestToken, requestGeneration, symbol) &&
        !aborted
      )
        setRetryError(`${marketDetailSectionTitle(capability)}重试失败，请稍后再试。`);
    } finally {
      retryQueryKeysRef.current = retryQueryKeysRef.current.filter(
        (activeKey) => activeKey !== queryKey,
      );
      if (lifecycle.requestIsCurrent(requestToken, requestGeneration, symbol)) setRetrying(null);
      retryRequestTokensRef.current.delete(requestToken);
      lifecycle.finishRequest(requestToken);
    }
  };

  const resetForIndicatorParams = () => {
    boundary.resetForIndicatorParams();
    for (const queryKey of retryQueryKeysRef.current)
      void queryClient.cancelQueries({ queryKey });
    retryQueryKeysRef.current = [];
    for (const token of retryRequestTokensRef.current) lifecycle.finishRequest(token);
    retryRequestTokensRef.current.clear();
    setRetrying(null);
    setRetryError(null);
  };

  return {
    ...boundary,
    queryFn,
    queryResponseGenerationRef,
    retrying,
    retryError,
    retrySection,
    resetForIndicatorParams,
  };
}
