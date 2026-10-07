import { useRef, useState, type MutableRefObject } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { MarketDetailCapability, MarketDetailResponse } from '@thesis-ledger/api-client';
import type { MarketIndicatorResult } from '@thesis-ledger/schemas';
import { requestMarketDetail } from './market-detail.api.js';
import {
  latestDetailQueryKey,
  useMarketChartLatestBoundary,
  type ChartWindowV3,
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
  navFund: boolean;
  adjustment?: 'none' | 'qfq' | 'hfq' | undefined;
  chartWindowV3: ChartWindowV3;
  refreshSequence: number;
  indicatorParams: MarketIndicatorParams;
  paramsKey: string;
  detail: MarketDetailResponse | null;
  chartPointsRef: MutableRefObject<ChartPoint[]>;
  requestGeneration: number;
  onLatestDetail: (response: MarketDetailResponse) => void;
  onSectionRetry: (response: MarketDetailResponse) => void;
};

export const responseMatchesIndicatorParams = (
  response: MarketDetailResponse,
  params: MarketIndicatorParams,
) => {
  const data = response.sections['indicator:MACD']?.data as MarketIndicatorResult | undefined;
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
    navFund,
    adjustment,
    chartWindowV3,
    refreshSequence,
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
    adjustment,
    chartWindowV3,
    refreshSequence,
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
      adjustment,
      chartWindowV3,
    );
    const { refresh, latestCheck } = boundary.openingState();
    const attemptStartedAt = Date.now();
    const requestToken = lifecycle.beginRequest();
    boundary.startOpeningLatest(queryKey, detail, attemptStartedAt, requestToken, latestCheck);
    try {
      const response = await requestMarketDetail(
        {
          symbol,
          ...(navFund
            ? { include: ['fund-nav', 'fund-nav-history'] as MarketDetailCapability[] }
            : {}),
          ...(adjustment ? { adjustment } : {}),
          barsLimit: chartWindowV3.barsLimit,
          chartContractVersion: 3,
          navLimit: 90,
          indicatorParams,
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
    const queryKey = [
      'desktop',
      'market-detail',
      symbol,
      'section',
      capability,
      paramsKey,
      adjustment ?? null,
      'chart-v3', chartWindowV3.barsLimit,
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
              ...(adjustment ? { adjustment } : {}),
              include: capability === 'bars' || capability.startsWith('indicator:')
                ? ['bars', 'indicator:MA', 'indicator:MACD', 'indicator:RSI'] : [capability],
              barsLimit: chartWindowV3.barsLimit,
              chartContractVersion: 3,
              navLimit: 90,
              indicatorParams,
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
        onSectionRetry(next);
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
