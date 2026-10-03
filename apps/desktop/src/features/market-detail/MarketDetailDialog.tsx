import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MarketDetailResponse,
} from '@thesis-ledger/api-client';
import type { Quote } from '@thesis-ledger/schemas';
import { MarketDetailDialogContent } from './MarketDetailDialogContent.js';
import { MarketChartAdjustment } from './MarketChartAdjustment.js';
import { useMarketChartSelection } from './useMarketChartSelection.js';
import {
  MarketDetailNotice,
  sectionIsVisible,
  type MarketDetailNoticeState,
} from './MarketDetailSections.js';
import type { MarketIndicatorParams } from './MarketDetailCharts.js';
import {
  MARKET_QUOTE_UPSTREAM_REFRESH_SECONDS,
  isQuoteWithinUpstreamRefreshWindow,
  mergeMarketDetail,
  quoteServedAgeMs,
  getVisibleMarketDetail,
  type MarketDetailPosition,
} from './market-detail.types.js';
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

const clearIndicatorSections = (response: MarketDetailResponse | null) => {
  if (!response) return response;
  const sections = { ...response.sections };
  delete sections['indicator:MA'];
  delete sections['indicator:MACD'];
  delete sections['indicator:RSI'];
  return { ...response, sections };
};

/** Resolve delayed work before committing it to the current request generation. */
export const commitIfCurrentGeneration = async <T,>(
  generation: number,
  currentGeneration: () => number,
  request: () => Promise<T>,
  commit: (value: T) => void,
) => {
  const value = await request();
  if (generation !== currentGeneration()) return false;
  commit(value);
  return true;
};

export function MarketDetailDialog({
  position,
  onClose,
  adjustment: initialAdjustment,
}: {
  position: MarketDetailPosition;
  onClose: () => void;
  adjustment?: 'none' | 'qfq' | 'hfq';
}) {
  const { adjustment, select } = useMarketChartSelection(position.symbol, initialAdjustment);
  const queryClient = useQueryClient();
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [chartBarsLimit, setChartBarsLimit] = useState(90);
  const chartWindowV3 = { barsLimit: chartBarsLimit };
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
    onLatestDetail: (next) => setDetail((current) => mergeMarketDetail(current, next)),
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
    staleTime: 15_000,
    retry: false,
    // 详情重新挂载即使命中客户端 fresh cache 也要执行一次最新检查；缓存只负责先展示。
    refetchOnMount: 'always',
  });

  useEffect(() => {
    activeSymbolRef.current = position.symbol;
    setDetail(null);
  }, [position.symbol, adjustment]);

  useEffect(() => {
    setChartBarsLimit(90);
    setIndicatorParams({ fast: 12, slow: 26, signal: 9, short: 6, mid: 12, long: 24 });
  }, [position.symbol]);

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
  const loadEarlier = () => {
    if (query.isFetching) return;
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
  const stale =
    Boolean(
      visibleDetail &&
      Object.values(visibleDetail.sections).some((section) => section.status === 'stale'),
    ) ||
    (query.isFetching && Boolean(visibleDetail));

  // 只有「行情分段」因上游刷新间隔回退，且回退数据仍在该间隔内时，
  // 才把提示降级为中性说明：此时它已是上游允许的最新结果，不是故障。
  const staleCapabilities = visibleDetail
    ? Object.values(visibleDetail.sections)
        .filter((section) => section.status === 'stale')
        .map((section) => section.capability)
    : [];
  const quoteWithinUpstreamWindow =
    quoteSection?.status === 'stale' &&
    isQuoteWithinUpstreamRefreshWindow(quoteSection.data as Quote | undefined);
  const staleWithinUpstreamWindowOnly =
    !query.isFetching &&
    staleCapabilities.length > 0 &&
    staleCapabilities.every((capability) => capability === 'quote') &&
    quoteWithinUpstreamWindow;

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

  const quoteAge = quoteServedAgeMs(quoteSection?.data as Quote | undefined);
  const remainingMinutes = Math.max(
    1,
    Math.ceil(
      (MARKET_QUOTE_UPSTREAM_REFRESH_SECONDS * 1_000 - (quoteAge ?? 0)) / 60_000,
    ),
  );
  // 上游刷新间隔内的回退不是故障：提示放进「实时行情」分段（分界线下、标题上），
  // 不再占用弹窗级横幅位置。弹窗级横幅只保留刷新中与真正的陈旧告警。
  const quoteUpstreamNotice = staleWithinUpstreamWindowOnly ? (
    <MarketDetailNotice
      flush
      state="info"
      title="行情按上游刷新间隔更新"
      description={`上游对单标的行情有约 ${
        MARKET_QUOTE_UPSTREAM_REFRESH_SECONDS / 60
      } 分钟最小刷新间隔，当前已是该间隔内的最新结果；约 ${remainingMinutes} 分钟后可再次刷新。`}
      onRetry={retryAll}
    />
  ) : null;

  const staleNotice: MarketDetailNoticeState = query.isFetching
    ? {
        state: 'stale',
        title: '正在刷新行情详情',
        description: '已保留当前可见内容，正在尝试获取更新数据。',
      }
    : {
        state: 'stale',
        title: '行情详情可能陈旧',
        description: '部分数据来自陈旧回退结果，仍可查看并可主动刷新。',
      };

  return (
    <MarketDetailDialogContent
      chartControls={position.asset.assetType !== 'fund' && /\.(SH|SZ|BJ)$/.test(position.symbol)
        ? <MarketChartAdjustment symbol={position.symbol} value={adjustment} onChange={select}
          plan={{ barsLimit: chartBarsLimit, indicatorParams }} refreshSequence={refreshSequence} /> : undefined}
      position={position}
      unit={unit}
      queryNotice={queryNotice()}
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
