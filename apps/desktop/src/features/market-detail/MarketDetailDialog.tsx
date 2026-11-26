import { useMarketChartRequestWindow } from './useMarketChartRequestWindow.js';
import {
  hasDifferentDetailChartScope,
  matchesDetailChartScope,
} from './market-detail-chart-scope.js';
import { chartHistoryPointLimit } from './chart-date-range.js';
import { isMarketMinuteTimeframe, marketCalculationAnchor } from '@thesis-ledger/schemas';
import { useMarketTradingOverlays } from './useMarketTradingOverlays.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMarketDetailQuery } from './useMarketDetailQuery.js';
import { MarketDetailRefreshControls } from './MarketDetailRefreshControls.js';
import type { MarketDisplayDetailResponse as MarketDetailResponse } from '@thesis-ledger/api-client';
import { MarketDetailDialogContent } from './MarketDetailDialogContent.js';
import { MarketChartAdjustment } from './MarketChartAdjustment.js';
import {
  useMarketPeriodNotice,
  useMarketPeriodDataReady,
  type ChartPeriod,
} from './MarketPeriodSelection.js';
import { MarketDetailSelection } from './MarketDetailSelection.js';
import { clearIndicatorSections } from './market-detail-generation.js';
export { commitIfCurrentGeneration } from './market-detail-generation.js';
import { MarketDetailNotice, sectionIsVisible } from './MarketDetailSections.js';
import type { MarketIndicatorParams } from './MarketDetailCharts.js';
import {
  mergeMarketDetail,
  getVisibleMarketDetail,
  type MarketDetailPosition,
} from './market-detail.types.js';
import { marketDetailNotices } from './market-detail-notices.js';
import { chartPageFromResponse } from './market-chart-types.js';
import { canCombineChartSeries } from './market-chart-acquisition.js';
import type { MarketChartPage } from './market-chart-types.js';
import { buildChartPoints, mergeChartPoints, type ChartPoint } from './market-chart-model.js';
import {
  latestDetailQueryKey,
  responseMatchesIndicatorParams,
  useMarketChartLatestRefresh,
} from './useMarketChartLatestRefresh.js';
export { responseMatchesIndicatorParams } from './useMarketChartLatestRefresh.js';

const indicatorParamsKey = (params: MarketIndicatorParams) => JSON.stringify(params);

type DetailDialogProps = {
  position: MarketDetailPosition;
  onClose: () => void;
  adjustment?: 'none' | 'qfq' | 'hfq';
};
export function MarketDetailDialog(props: DetailDialogProps) {
  return (
    <MarketDetailSelection position={props.position} initial={props.adjustment}>
      {({ timeframe, adjustment, select }) => (
        <MarketDetailDialogView
          position={props.position}
          onClose={props.onClose}
          {...(adjustment ? { adjustment } : {})}
          select={select}
          timeframe={timeframe}
          key={props.position.symbol}
        />
      )}
    </MarketDetailSelection>
  );
}

function MarketDetailDialogView(props: {
  position: MarketDetailPosition;
  onClose: () => void;
  adjustment?: 'none' | 'qfq' | 'hfq';
  select: (adjustment: 'none' | 'qfq' | 'hfq') => void;
  timeframe: ChartPeriod;
}) {
  const control = useMarketDetailDialog(props);
  const {
    position,
    adjustment,
    select,
    chartBarsLimit,
    indicatorParams,
    historyEnd,
    timeframe,
    refreshSequence,
    query,
    latestRefresh,
    retryAll,
    tradingOverlay,
    unit,
    periodNotice,
    queryNotice,
    loading,
    stale,
    staleNotice,
    visibleDetail,
    quoteInfoNotice,
    quoteSection,
    barsSection,
    chartIndicators,
    chartPoints,
    updateIndicatorParams,
    loadEarlier,
    canLoadEarlier,
    chartScopeReady,
    chipSection,
    fundNavSection,
    fundNavHistorySection,
    indicatorCapabilities,
    onClose,
  } = control;

  return (
    <MarketDetailDialogContent
      chartControls={
        <>
          {position.asset.assetType !== 'fund' && /\.(SH|SZ|BJ|HK|US)$/.test(position.symbol) ? (
            <MarketChartAdjustment
              symbol={position.symbol}
              value={adjustment}
              onChange={select}
              plan={{
                barsLimit: chartBarsLimit,
                indicatorParams,
                ...(historyEnd ? { end: historyEnd } : {}),
                ...(isMarketMinuteTimeframe(timeframe) ? { timeframe } : {}),
              }}
              refreshSequence={refreshSequence}
            />
          ) : null}
          <MarketDetailRefreshControls
            refreshing={
              query.isFetching || latestRefresh.latestLoading || latestRefresh.retrying !== null
            }
            onRefresh={retryAll}
            automatic={query.autoRefresh}
            onAutomaticChange={query.setAutoRefresh}
            minute={position.asset.assetType !== 'fund' && isMarketMinuteTimeframe(timeframe)}
          />
        </>
      }
      position={position}
      tradingOverlay={tradingOverlay}
      unit={unit}
      queryNotice={
        <>
          {periodNotice}
          {queryNotice()}
        </>
      }
      loading={loading}
      stale={stale}
      staleNotice={staleNotice}
      retryError={latestRefresh.retryError}
      visibleDetail={visibleDetail}
      quoteInfoNotice={quoteInfoNotice}
      quoteSection={quoteSection}
      barsSection={barsSection}
      chartIndicators={chartIndicators}
      chartPoints={chartPoints.length > 0 ? chartPoints : undefined}
      onIndicatorParamsChange={updateIndicatorParams}
      onLoadEarlier={loadEarlier}
      canLoadEarlier={canLoadEarlier}
      historyLoading={query.isFetching}
      historyError={null}
      onRetryEarlier={() => {
        void query.refetch();
      }}
      onLoadLater={() => {
        void latestRefresh.loadLater();
      }}
      onRetryLater={() => {
        void latestRefresh.retryLater();
      }}
      canLoadLater={chartScopeReady && chartPoints.length > 0}
      latestLoading={latestRefresh.latestLoading}
      latestNotice={latestRefresh.latestNotice}
      latestError={latestRefresh.latestError}
      chipSection={chipSection}
      fundNavSection={fundNavSection}
      fundNavHistorySection={fundNavHistorySection}
      indicatorCapabilities={indicatorCapabilities}
      retrying={latestRefresh.retrying}
      onRetrySection={latestRefresh.retrySection}
      onClose={onClose}
    />
  );
}

function useMarketDetailDialog({
  position,
  onClose,
  adjustment,
  select,
  timeframe,
}: {
  position: MarketDetailPosition;
  onClose: () => void;
  adjustment?: 'none' | 'qfq' | 'hfq';
  select: (adjustment: 'none' | 'qfq' | 'hfq') => void;
  timeframe: ChartPeriod;
}) {
  const {
    periodNotice,
    periodDataReady,
    queryClient,
    refreshSequence,
    setRefreshSequence,
    chartBarsLimit,
    setChartBarsLimit,
    historyAnchor,
    setHistoryAnchor,
    historyEnd,
    chartWindowV3,
    detail,
    setDetail,
    indicatorParams,
    setIndicatorParams,
    requestGenerationRef,
    chartPointsRef,
    requestGeneration,
    retainedOtherPeriod,
  } = useMarketDetailRequestState(position, timeframe, adjustment);
  const latestRefresh = useMarketChartLatestRefresh({
    queryClient,
    symbol: position.symbol,
    navFund: position.asset.assetType === 'fund',
    adjustment,
    chartWindowV3,
    refreshSequence,
    indicatorParams,
    paramsKey: indicatorParamsKey(indicatorParams),
    detail,
    chartOnly: retainedOtherPeriod,
    chartPointsRef,
    requestGeneration,
    onLatestDetail: (next) => {
      if (!matchesDetailChartScope(next, position.symbol, timeframe, adjustment)) return;
      if (historyAnchor) {
        queryClient.setQueryData(
          latestDetailQueryKey(position.symbol, refreshSequence, indicatorParams, adjustment, {
            barsLimit: chartBarsLimit,
            timeframe,
          }),
          next,
        );
        setHistoryAnchor(undefined);
      }
      setDetail((current) => mergeMarketDetail(current, next));
    },
    onSectionRetry: (next) => {
      if (!matchesDetailChartScope(next, position.symbol, timeframe, adjustment)) return;
      setDetail((current) => mergeMarketDetail(current, next));
    },
  });
  const query = useMarketDetailQuery({
    symbol: position.symbol,
    refreshSequence,
    indicatorParams,
    adjustment,
    chartWindowV3,
    enabled: periodDataReady,
    latestRefresh,
  });

  useEffect(() => {
    if (
      query.data &&
      matchesDetailChartScope(query.data, position.symbol, timeframe, adjustment) &&
      responseMatchesIndicatorParams(query.data, indicatorParams)
    ) {
      setDetail((current) => mergeMarketDetail(current, query.data));
    }
  }, [indicatorParams, query.data, requestGeneration, position.symbol, timeframe, adjustment]);

  const queryDataForCurrentParams =
    query.data &&
    matchesDetailChartScope(query.data, position.symbol, timeframe, adjustment) &&
    responseMatchesIndicatorParams(query.data, indicatorParams)
      ? query.data
      : undefined;
  const visibleDetail = useMemo(() => {
    if (retainedOtherPeriod && queryDataForCurrentParams)
      return mergeMarketDetail(detail, queryDataForCurrentParams);
    return getVisibleMarketDetail(detail, queryDataForCurrentParams, position.symbol);
  }, [detail, queryDataForCurrentParams, position.symbol, retainedOtherPeriod]);
  const chartScopeReady = !hasDifferentDetailChartScope(
    visibleDetail,
    position.symbol,
    timeframe,
    adjustment,
  );
  const indicatorCapabilities = useMemo(
    () =>
      visibleDetail
        ? visibleDetail.requested.filter(
            (capability) =>
              capability.startsWith('indicator:') &&
              sectionIsVisible(visibleDetail.sections[capability]),
          )
        : [],
    [visibleDetail],
  );

  const retryAll = () => {
    latestRefresh.cancelLatest();
    setHistoryAnchor(undefined);
    setRefreshSequence((value) => {
      const next = value + 1;
      latestRefresh.markRefreshSequence(next);
      return next;
    });
  };

  const unit = position.asset.assetType === 'stock' ? '股' : '份';
  const quoteSection = visibleDetail?.sections.quote;
  const barsSection = visibleDetail?.sections.bars;
  const { chartIndicators, chartPoints, overlayBars } = useMarketDetailChartPages(
    indicatorParams,
    latestRefresh,
    visibleDetail,
    chartPointsRef,
  );
  const tradingOverlay = useMarketTradingOverlays(overlayBars, position);
  const loadEarlier = (requestedStart?: string) => {
    if (query.isFetching || !chartScopeReady) return;
    const last = visibleDetail?.barSeries?.points.at(-1);
    let timestamp = historyAnchor;
    if (!timestamp && last) {
      if ('observedEndAt' in last && typeof last.observedEndAt === 'string')
        timestamp = last.observedEndAt;
      else if ('bucketEndAt' in last && typeof last.bucketEndAt === 'string')
        timestamp = last.bucketEndAt;
      else timestamp = last.timestamp;
    }
    if (typeof timestamp === 'string' && timestamp) setHistoryAnchor(timestamp);
    setChartBarsLimit((limit) =>
      chartHistoryPointLimit(limit, requestedStart, last?.timestamp, timeframe),
    );
  };
  const canLoadEarlier = Boolean(
    chartScopeReady &&
    chartBarsLimit < 3000 &&
    visibleDetail?.barSeries?.coverage.hasMoreBefore === true,
  );
  const updateIndicatorParams = (next: MarketIndicatorParams) => {
    if (JSON.stringify(indicatorParams) === JSON.stringify(next)) return;
    requestGenerationRef.current += 1;
    latestRefresh.resetForIndicatorParams();
    setDetail((current) => clearIndicatorSections(current));
    setIndicatorParams(next);
  };
  const chipSection = visibleDetail?.sections.chip;
  const fundNavSection = visibleDetail?.sections['fund-nav'];
  const fundNavHistorySection = visibleDetail?.sections['fund-nav-history'];
  const loading = query.isPending && query.isFetching && !visibleDetail;
  const queryError = query.isError && !visibleDetail;
  const refreshError = query.isError && Boolean(visibleDetail);
  const { stale, staleNotice, quoteInfoNotice } = marketDetailNotices(
    visibleDetail,
    query.isFetching && chartScopeReady,
  );

  const { queryNotice } = createMarketDetailQueryNotice(queryError, refreshError);

  return {
    position,
    adjustment,
    select,
    chartBarsLimit,
    indicatorParams,
    historyEnd,
    timeframe,
    refreshSequence,
    query,
    latestRefresh,
    retryAll,
    tradingOverlay,
    unit,
    periodNotice,
    queryNotice,
    loading,
    stale,
    staleNotice,
    visibleDetail,
    quoteInfoNotice,
    quoteSection,
    barsSection,
    chartIndicators,
    chartPoints,
    updateIndicatorParams,
    loadEarlier,
    canLoadEarlier,
    chartScopeReady,
    chipSection,
    fundNavSection,
    fundNavHistorySection,
    indicatorCapabilities,
    onClose,
  };
}

function useMarketDetailChartPages(
  indicatorParams: MarketIndicatorParams,
  latestRefresh: ReturnType<typeof useMarketChartLatestRefresh>,
  visibleDetail: MarketDetailResponse | null,
  chartPointsRef: { current: ChartPoint[] },
) {
  const currentParamsKey = indicatorParamsKey(indicatorParams);
  const chartPages = useMemo(() => {
    const pages = latestRefresh.laterPages
      .filter(({ paramsKey }) => paramsKey === currentParamsKey)
      .filter(
        ({ response }) =>
          !visibleDetail?.barSeries ||
          !response.barSeries ||
          canCombineChartSeries(visibleDetail.barSeries, response.barSeries),
      )
      .flatMap(({ response }) => {
        const page = chartPageFromResponse(response);
        return page ? [page] : [];
      });
    if (pages.length > 0) return pages;
    const fallback = visibleDetail ? chartPageFromResponse(visibleDetail) : null;
    return fallback ? [fallback] : [];
  }, [currentParamsKey, latestRefresh.laterPages, visibleDetail]);
  const chartIndicators = useMemo(
    () => chartPages.flatMap((page: MarketChartPage) => page.indicators),
    [chartPages],
  );
  const chartPoints = useMemo(
    () =>
      mergeChartPoints(
        chartPages.map((page: MarketChartPage) => buildChartPoints(page.bars, page.indicators)),
      ),
    [chartPages],
  );
  chartPointsRef.current = chartPoints;
  const overlayBars = useMemo(
    () => chartPoints.flatMap((point) => (point.bar ? [point.bar] : [])),
    [chartPoints],
  );
  return { chartIndicators, chartPoints, overlayBars };
}

function useMarketDetailRequestState(
  position: MarketDetailPosition,
  timeframe: ChartPeriod,
  adjustment: 'none' | 'qfq' | 'hfq' | undefined,
) {
  const periodNotice = useMarketPeriodNotice();
  const periodDataReady = useMarketPeriodDataReady();
  const queryClient = useQueryClient();
  const [refreshSequence, setRefreshSequence] = useState(0);
  const {
    limit: chartBarsLimit,
    setLimit: setChartBarsLimit,
    anchor: historyAnchor,
    setAnchor: setHistoryAnchor,
  } = useMarketChartRequestWindow(position.symbol, timeframe, adjustment);
  const historyEnd = marketCalculationAnchor({
    symbol: position.symbol,
    calculationAnchor: historyAnchor,
  })?.end;
  const chartWindowV3 = {
    barsLimit: chartBarsLimit,
    timeframe,
    ...(historyAnchor ? { calculationAnchor: historyAnchor } : {}),
  };
  const [detail, setDetail] = useState<MarketDetailResponse | null>(null);
  const [indicatorParams, setIndicatorParams] = useState<MarketIndicatorParams>({
    fast: 12,
    slow: 26,
    signal: 9,
    short: 6,
    mid: 12,
    long: 24,
  });
  const requestGenerationRef = useRef(0);
  const requestSignatureRef = useRef('');
  const chartPointsRef = useRef<ChartPoint[]>([]);
  const requestSignature = JSON.stringify({
    symbol: position.symbol,
    adjustment: adjustment ?? null,
    chartWindowV3,
    refreshSequence,
    indicatorParams,
  });
  if (requestSignatureRef.current !== requestSignature) {
    requestSignatureRef.current = requestSignature;
    requestGenerationRef.current += 1;
  }
  const requestGeneration = requestGenerationRef.current;
  const retainedOtherPeriod = hasDifferentDetailChartScope(
    detail,
    position.symbol,
    timeframe,
    adjustment,
  );
  return {
    periodNotice,
    periodDataReady,
    queryClient,
    refreshSequence,
    setRefreshSequence,
    chartBarsLimit,
    setChartBarsLimit,
    historyAnchor,
    setHistoryAnchor,
    historyEnd,
    chartWindowV3,
    detail,
    setDetail,
    indicatorParams,
    setIndicatorParams,
    requestGenerationRef,
    chartPointsRef,
    requestGeneration,
    retainedOtherPeriod,
  };
}

function createMarketDetailQueryNotice(queryError: boolean, refreshError: boolean) {
  const queryNotice = () => {
    if (queryError)
      return (
        <MarketDetailNotice
          state="error"
          title="行情详情读取失败"
          description="当前详情未能读取，请检查服务连接后重试。"
        />
      );
    if (refreshError)
      return (
        <MarketDetailNotice
          state="error"
          title="行情详情刷新失败"
          description="已保留上次可见内容，本次更新未成功，请稍后重试。"
        />
      );
    return null;
  };
  return { queryNotice };
}
