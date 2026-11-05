import { isMarketMinuteTimeframe, marketCalculationAnchor } from '@thesis-ledger/schemas';
import { useMarketTradingOverlays } from './useMarketTradingOverlays.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MarketDisplayDetailResponse as MarketDetailResponse,
} from '@thesis-ledger/api-client';
import { MarketDetailDialogContent } from './MarketDetailDialogContent.js';
import { MarketChartAdjustment } from './MarketChartAdjustment.js';
import { useMarketPeriodNotice, useMarketPeriodDataReady, type ChartPeriod } from './MarketPeriodSelection.js';
import { MarketDetailSelection } from './MarketDetailSelection.js';
import { clearIndicatorSections } from './market-detail-generation.js';
export { commitIfCurrentGeneration } from './market-detail-generation.js';
import {
  MarketDetailNotice,
  sectionIsVisible,
} from './MarketDetailSections.js';
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

type DetailDialogProps = { position: MarketDetailPosition; onClose: () => void; adjustment?: 'none' | 'qfq' | 'hfq' };
export function MarketDetailDialog(props: DetailDialogProps) {
  return <MarketDetailSelection position={props.position} initial={props.adjustment}>
    {({ timeframe, adjustment, select }) => <MarketDetailDialogView position={props.position} onClose={props.onClose}
      {...(adjustment ? { adjustment } : {})} select={select} timeframe={timeframe} key={`${props.position.symbol}:${timeframe}`} />}
  </MarketDetailSelection>;
}

function MarketDetailDialogView({
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
  const periodNotice = useMarketPeriodNotice();
  const periodDataReady = useMarketPeriodDataReady();
  const queryClient = useQueryClient();
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [chartBarsLimit, setChartBarsLimit] = useState(timeframe === '1y' ? 2 : 90);
  const historyScope = JSON.stringify([position.symbol, timeframe, adjustment ?? null]);
  const [historyAnchorState, setHistoryAnchor] = useState<{ scope: string; timestamp: string }>();
  const historyAnchor = historyAnchorState?.scope === historyScope ? historyAnchorState.timestamp : undefined;
  const historyEnd = marketCalculationAnchor({ symbol: position.symbol, calculationAnchor: historyAnchor })?.end;
  const chartWindowV3 = { barsLimit: chartBarsLimit, timeframe, ...(historyAnchor ? { calculationAnchor: historyAnchor } : {}) };
  const [detail, setDetail] = useState<MarketDetailResponse | null>(null);
  const [indicatorParams, setIndicatorParams] = useState<MarketIndicatorParams>({
    fast: 12,
    slow: 26,
    signal: 9,
    short: 6,
    mid: 12,
    long: 24,
  });
  const activeSymbolRef = useRef(position.symbol);
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
    chartPointsRef,
    requestGeneration,
    onLatestDetail: (next) => {
      if (historyAnchor) {
        queryClient.setQueryData(latestDetailQueryKey(position.symbol, refreshSequence, indicatorParams, adjustment,
          { barsLimit: chartBarsLimit, timeframe }), next);
        setHistoryAnchor(undefined);
      }
      setDetail((current) => mergeMarketDetail(current, next));
    },
    onSectionRetry: (next) => {
      setDetail((current) => mergeMarketDetail(current, next));
    },
  });
  const query = useQuery({
    queryKey: latestDetailQueryKey(
      position.symbol,
      refreshSequence,
      indicatorParams,
      adjustment,
      chartWindowV3,
    ),
    queryFn: latestRefresh.queryFn,
    enabled: periodDataReady,
    staleTime: 15_000,
    retry: false,
    // 详情重新挂载即使命中客户端 fresh cache 也要执行一次最新检查；缓存只负责先展示。
    refetchOnMount: 'always',
  });

  useEffect(() => {
    activeSymbolRef.current = position.symbol;
    setDetail(null);
    setHistoryAnchor(undefined);
  }, [position.symbol, adjustment]);

  useEffect(() => {
    setChartBarsLimit(timeframe === '1y' ? 2 : 90);
    setIndicatorParams({ fast: 12, slow: 26, signal: 9, short: 6, mid: 12, long: 24 });
  }, [position.symbol, timeframe]);

  useEffect(() => {
    if (
      query.data &&
      query.data.symbol === activeSymbolRef.current &&
      (latestRefresh.queryResponseGenerationRef.current.get(query.data.requestId) === undefined ||
        latestRefresh.queryResponseGenerationRef.current.get(query.data.requestId) === requestGeneration) &&
      responseMatchesIndicatorParams(query.data, indicatorParams)
    ) {
      setDetail((current) => mergeMarketDetail(current, query.data));
    }
  }, [indicatorParams, query.data, requestGeneration]);

  const queryDataForCurrentParams =
    query.data &&
    (latestRefresh.queryResponseGenerationRef.current.get(query.data.requestId) === undefined ||
      latestRefresh.queryResponseGenerationRef.current.get(query.data.requestId) === requestGeneration) &&
    responseMatchesIndicatorParams(query.data, indicatorParams)
      ? query.data
      : undefined;
  const visibleDetail = getVisibleMarketDetail(detail, queryDataForCurrentParams, position.symbol);
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
  const currentParamsKey = indicatorParamsKey(indicatorParams);
  const chartPages = useMemo(() => {
    const pages = latestRefresh.laterPages
      .filter(({ paramsKey }) => paramsKey === currentParamsKey)
      .filter(({ response }) => !visibleDetail?.barSeries || !response.barSeries ||
        canCombineChartSeries(visibleDetail.barSeries, response.barSeries))
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
  const overlayBars = useMemo(() => chartPoints.flatMap((point) => point.bar ? [point.bar] : []), [chartPoints]);
  const tradingOverlay = useMarketTradingOverlays(overlayBars, position);
  const loadEarlier = () => {
    if (query.isFetching) return;
    const last = visibleDetail?.barSeries?.points.at(-1);
    let timestamp = historyAnchor;
    if (!timestamp && last) {
      if ('observedEndAt' in last && typeof last.observedEndAt === 'string') timestamp = last.observedEndAt;
      else if ('bucketEndAt' in last && typeof last.bucketEndAt === 'string') timestamp = last.bucketEndAt;
      else timestamp = last.timestamp;
    }
    if (typeof timestamp === 'string' && timestamp) setHistoryAnchor({ scope: historyScope, timestamp });
    setChartBarsLimit((limit) => Math.min(3000, limit + 90));
  };
  const canLoadEarlier = Boolean(
    chartBarsLimit < 3000 && visibleDetail?.barSeries?.coverage.hasMoreBefore === true,
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
  const loading = query.isPending && !visibleDetail;
  const queryError = query.isError && !visibleDetail;
  const refreshError = query.isError && Boolean(visibleDetail);
  const { stale, staleNotice, quoteUpstreamNotice } = marketDetailNotices(visibleDetail, query.isFetching, retryAll);

  const queryNotice = () => {
    if (loading)
      return (
        <MarketDetailNotice
          state="loading"
          title="正在加载行情详情"
          description="正在按服务端声明的能力读取行情，请稍候。"
        />
      );
    if (queryError)
      return (
        <MarketDetailNotice
          state="error"
          title="行情详情读取失败"
          description="当前详情未能读取，请检查服务连接后重试。"
          onRetry={retryAll}
        />
      );
    if (refreshError)
      return (
        <MarketDetailNotice
          state="error"
          title="行情详情刷新失败"
          description="已保留上次可见内容，本次更新未成功，请稍后重试。"
          onRetry={retryAll}
        />
      );
    return null;
  };

  return (
    <MarketDetailDialogContent
      chartControls={position.asset.assetType !== 'fund' && /\.(SH|SZ|BJ|HK|US)$/.test(position.symbol)
        ? <MarketChartAdjustment symbol={position.symbol} value={adjustment} onChange={select}
          plan={{ barsLimit: chartBarsLimit, indicatorParams, ...(historyEnd ? { end: historyEnd } : {}), ...(isMarketMinuteTimeframe(timeframe) ? { timeframe: '1m' } : {}) }} refreshSequence={refreshSequence} /> : undefined}
      position={position}
      tradingOverlay={tradingOverlay}
      unit={unit}
      queryNotice={<>{periodNotice}{queryNotice()}</>}
      loading={loading}
      stale={stale}
      staleNotice={staleNotice}
      retryError={latestRefresh.retryError}
      visibleDetail={visibleDetail}
      quoteUpstreamNotice={quoteUpstreamNotice}
      quoteSection={quoteSection}
      barsSection={barsSection}
      chartIndicators={chartIndicators}
      chartPoints={chartPoints.length > 0 ? chartPoints : undefined}
      onIndicatorParamsChange={updateIndicatorParams}
      onLoadEarlier={loadEarlier}
      canLoadEarlier={canLoadEarlier}
      historyLoading={query.isFetching}
      historyError={null}
      onRetryEarlier={() => { void query.refetch(); }}
      onLoadLater={latestRefresh.loadLater}
      onRetryLater={latestRefresh.retryLater}
      canLoadLater={chartPoints.length > 0}
      latestLoading={latestRefresh.latestLoading}
      latestNotice={latestRefresh.latestNotice}
      latestError={latestRefresh.latestError}
      chipSection={chipSection}
      fundNavSection={fundNavSection}
      fundNavHistorySection={fundNavHistorySection}
      indicatorCapabilities={indicatorCapabilities}
      retrying={latestRefresh.retrying}
      onRetryAll={retryAll}
      onRetrySection={latestRefresh.retrySection}
      onClose={onClose}
    />
  );
}
