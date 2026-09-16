import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MarketDetailCapability,
  MarketDetailResponseV2,
  MarketDetailSectionV2,
} from '@thesis-ledger/api-client';
import type { IndicatorResultV2 } from '@thesis-ledger/schemas';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MarketColorMenu } from '@/components/market-color-menu';
import { marketToneForValue } from '@/ui/market-color';
import { requestMarketDetail } from './market-detail.api.js';
import {
  BarsSection,
  ChipSection,
  DetailMetric,
  FundNavHistorySection,
  FundNavSection,
  IndicatorSection,
  MarketDetailLoadingSections,
  MarketDetailNotice,
  QuoteSection,
  sectionIsVisible,
} from './MarketDetailSections.js';
import type { MarketIndicatorParams } from './MarketDetailCharts.js';
import {
  marketDetailSectionTitle,
  mergeMarketDetail,
  getVisibleMarketDetail,
  type MarketDetailPosition,
} from './market-detail.types.js';
import { chartPageFromResponse } from './market-chart-types.js';
import type { MarketChartIndicator, MarketChartPage } from './market-chart-types.js';
import { buildChartPoints, mergeChartPoints, type ChartPoint } from './market-chart-model.js';

const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

const detailQueryKey = (
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

type HistoryPage = {
  key: string;
  paramsKey: string;
  end?: string;
  response: MarketDetailResponseV2;
};

const indicatorParamsKey = (params: MarketIndicatorParams) => JSON.stringify(params);

const clearIndicatorSections = (response: MarketDetailResponseV2 | null) => {
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

export function MarketDetailDialog({
  position,
  onClose,
}: {
  position: MarketDetailPosition;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [detail, setDetail] = useState<MarketDetailResponseV2 | null>(null);
  const [historyPages, setHistoryPages] = useState<HistoryPage[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [indicatorParams, setIndicatorParams] = useState<MarketIndicatorParams>({
    fast: 12,
    slow: 26,
    signal: 9,
    short: 6,
    mid: 12,
    long: 24,
  });
  const [historyEnd, setHistoryEnd] = useState<string | undefined>();
  const [historyCalculationAnchor, setHistoryCalculationAnchor] = useState<string | undefined>();
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyExhausted, setHistoryExhausted] = useState(false);
  const [historyLoadingEnd, setHistoryLoadingEnd] = useState<string | undefined>();
  const [parameterRefreshEnds, setParameterRefreshEnds] = useState<string[]>([]);
  const [parameterRefreshRevision, setParameterRefreshRevision] = useState(0);
  const [parameterRefreshLoading, setParameterRefreshLoading] = useState(false);
  const [parameterRefreshError, setParameterRefreshError] = useState<string | null>(null);
  const pendingRefreshSequenceRef = useRef<number | null>(null);
  const activeSymbolRef = useRef(position.symbol);
  const retryQueryKeysRef = useRef<Array<readonly unknown[]>>([]);
  const requestGenerationRef = useRef(0);
  const requestSignatureRef = useRef('');
  const queryResponseGenerationRef = useRef(new Map<string, number>());
  const requestSignature = JSON.stringify({
    symbol: position.symbol,
    refreshSequence,
    indicatorParams,
    historyEnd: historyEnd ?? null,
    calculationAnchor: historyCalculationAnchor ?? null,
  });
  if (requestSignatureRef.current !== requestSignature) {
    requestSignatureRef.current = requestSignature;
    requestGenerationRef.current += 1;
  }
  const requestGeneration = requestGenerationRef.current;
  const query = useQuery({
    queryKey: detailQueryKey(
      position.symbol,
      refreshSequence,
      indicatorParams,
      historyEnd,
      historyCalculationAnchor,
    ),
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const refresh = pendingRefreshSequenceRef.current === refreshSequence;
      if (refresh) pendingRefreshSequenceRef.current = null;
      const historyInclude = ['bars', 'indicator:MA', 'indicator:MACD', 'indicator:RSI'] as const;
      const response = await requestMarketDetail(
        {
          symbol: position.symbol,
          ...(historyEnd ? { include: historyInclude } : {}),
          barsLimit: 90,
          navLimit: 90,
          indicatorParams,
          ...(historyEnd ? { end: historyEnd } : {}),
          ...(historyCalculationAnchor ? { calculationAnchor: historyCalculationAnchor } : {}),
          ...(refresh ? { refresh: true } : {}),
        },
        signal,
      );
      if (requestGeneration !== requestGenerationRef.current) {
        throw new DOMException('行情请求已过期', 'AbortError');
      }
      queryResponseGenerationRef.current.set(response.requestId, requestGeneration);
      return response;
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    activeSymbolRef.current = position.symbol;
    setDetail(null);
    setHistoryPages([]);
    setRetryError(null);
    setIndicatorParams({ fast: 12, slow: 26, signal: 9, short: 6, mid: 12, long: 24 });
    setHistoryEnd(undefined);
    setHistoryCalculationAnchor(undefined);
    setHistoryError(null);
    setHistoryExhausted(false);
    setHistoryLoadingEnd(undefined);
    setParameterRefreshEnds([]);
    setParameterRefreshLoading(false);
    setParameterRefreshError(null);
    pendingRefreshSequenceRef.current = null;
    return () => {
      for (const queryKey of retryQueryKeysRef.current)
        void queryClient.cancelQueries({ queryKey });
      retryQueryKeysRef.current = [];
    };
  }, [position.symbol, queryClient]);

  useEffect(() => {
    if (parameterRefreshEnds.length === 0) return;
    const generation = requestGenerationRef.current;
    const params = indicatorParams;
    const symbol = position.symbol;
    let cancelled = false;
    const controller = new AbortController();
    setParameterRefreshLoading(true);
    setParameterRefreshError(null);

    const refreshLoadedPages = async () => {
      for (const end of parameterRefreshEnds) {
        if (cancelled || generation !== requestGenerationRef.current) return;
        const committed = await commitIfCurrentGeneration(
          generation,
          () => requestGenerationRef.current,
          () =>
            requestMarketDetail(
              {
                symbol,
                include: ['bars', 'indicator:MA', 'indicator:MACD', 'indicator:RSI'],
                barsLimit: 90,
                navLimit: 90,
                indicatorParams: params,
                end,
              },
              controller.signal,
            ),
          (next) => {
            if (cancelled || next.symbol !== activeSymbolRef.current) return;
            setDetail((current) => mergeMarketDetail(current, next));
            const paramsKey = indicatorParamsKey(params);
            const pageKey = JSON.stringify({ paramsKey, end });
            setHistoryPages((current) => {
              const page = {
                key: pageKey,
                paramsKey,
                ...(end ? { end } : {}),
                response: next,
              };
              const index = current.findIndex((item) => item.key === pageKey);
              if (index < 0) return [...current, page];
              return current.map((item, itemIndex) => (itemIndex === index ? page : item));
            });
          },
        );
        if (!committed) return;
      }
      if (!cancelled && generation === requestGenerationRef.current) {
        setParameterRefreshLoading(false);
        setParameterRefreshEnds([]);
      }
    };

    void refreshLoadedPages().catch((error) => {
      if (
        !cancelled &&
        generation === requestGenerationRef.current &&
        !(error instanceof DOMException && error.name === 'AbortError')
      ) {
        setParameterRefreshLoading(false);
        setParameterRefreshError('指标参数更新失败，已保留价格与当前行情。');
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [indicatorParams, parameterRefreshEnds, parameterRefreshRevision, position.symbol]);

  useEffect(() => {
    if (
      query.data &&
      query.data.symbol === activeSymbolRef.current &&
      (queryResponseGenerationRef.current.get(query.data.requestId) === undefined ||
        queryResponseGenerationRef.current.get(query.data.requestId) === requestGeneration) &&
      responseMatchesIndicatorParams(query.data, indicatorParams)
    ) {
      setDetail((current) => mergeMarketDetail(current, query.data));
      const paramsKey = indicatorParamsKey(indicatorParams);
      const pageKey = JSON.stringify({ paramsKey, end: historyEnd ?? null });
      setHistoryPages((current) => {
        const page = {
          key: pageKey,
          paramsKey,
          ...(historyEnd ? { end: historyEnd } : {}),
          response: query.data,
        };
        const index = current.findIndex((item) => item.key === pageKey);
        if (index < 0) return [...current, page];
        return current.map((item, itemIndex) => (itemIndex === index ? page : item));
      });
    }
  }, [historyEnd, indicatorParams, query.data, requestGeneration]);

  useEffect(() => {
    if (!historyEnd) return;
    if (query.isError) {
      setHistoryError('更早日线加载失败，当前图表已保留。');
      setHistoryLoadingEnd(undefined);
      return;
    }
    if (!query.data) return;
    const incomingBars = query.data.barSeries?.points;
    const incomingEarliest = incomingBars?.[0]?.timestamp?.slice(0, 10);
    if (!incomingEarliest || incomingEarliest > historyEnd) {
      setHistoryError('没有更多可用的更早日线。');
      setHistoryExhausted(true);
    } else {
      setHistoryError(null);
      setHistoryExhausted(false);
    }
    setHistoryLoadingEnd(undefined);
  }, [historyEnd, query.data, query.isError]);

  const queryDataForCurrentParams =
    query.data &&
    (queryResponseGenerationRef.current.get(query.data.requestId) === undefined ||
      queryResponseGenerationRef.current.get(query.data.requestId) === requestGeneration) &&
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

  const retryAll = () =>
    setRefreshSequence((value) => {
      const next = value + 1;
      pendingRefreshSequenceRef.current = next;
      return next;
    });

  const retrySection = async (capability: MarketDetailCapability) => {
    const symbol = position.symbol;
    const params = indicatorParams;
    const paramsKey = indicatorParamsKey(params);
    const end = historyEnd;
    const generation = requestGenerationRef.current;
    const queryKey = [
      'desktop',
      'market-detail',
      symbol,
      'section',
      capability,
      paramsKey,
      end ?? null,
    ] as const;
    retryQueryKeysRef.current.push(queryKey);
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
              indicatorParams: params,
              ...(end ? { end } : {}),
              refresh: true,
            },
            signal,
          ),
        staleTime: 0,
      });
      if (
        generation === requestGenerationRef.current &&
        activeSymbolRef.current === symbol &&
        next.symbol === symbol &&
        responseMatchesIndicatorParams(next, params)
      )
        setDetail((current) => mergeMarketDetail(current, next));
      if (
        generation === requestGenerationRef.current &&
        activeSymbolRef.current === symbol &&
        next.symbol === symbol &&
        responseMatchesIndicatorParams(next, params)
      ) {
        setHistoryPages((current) => [
          ...current,
          {
            key: `retry:${capability}:${next.requestId}`,
            paramsKey,
            ...(end ? { end } : {}),
            response: next,
          },
        ]);
      }
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      if (
        !aborted &&
        generation === requestGenerationRef.current &&
        activeSymbolRef.current === symbol
      )
        setRetryError(`${marketDetailSectionTitle(capability)}重试失败，请稍后再试。`);
    } finally {
      retryQueryKeysRef.current = retryQueryKeysRef.current.filter(
        (activeKey) => activeKey !== queryKey,
      );
      if (generation === requestGenerationRef.current && activeSymbolRef.current === symbol)
        setRetrying(null);
    }
  };

  const unit = position.asset.assetType === 'stock' ? '股' : '份';
  const quoteSection = visibleDetail?.sections.quote;
  const barsSection = visibleDetail?.sections.bars;
  const currentParamsKey = indicatorParamsKey(indicatorParams);
  const chartPages = useMemo(() => {
    const pages = historyPages
      .filter(({ paramsKey }) => paramsKey === currentParamsKey)
      .flatMap(({ response }) => {
        const page = chartPageFromResponse(response);
        return page ? [page] : [];
      });
    if (pages.length > 0) return pages;
    const fallback = visibleDetail ? chartPageFromResponse(visibleDetail) : null;
    return fallback ? [fallback] : [];
  }, [currentParamsKey, historyPages, visibleDetail]);
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
  const chartBars = visibleDetail?.barSeries?.points ?? [];
  const loadEarlier = () => {
    if (query.isFetching || historyLoadingEnd) return;
    const firstDate = chartBars[0]?.timestamp;
    if (!firstDate) return;
    const date = new Date(firstDate);
    date.setUTCDate(date.getUTCDate() - 1);
    const nextEnd = date.toISOString().slice(0, 10);
    if (nextEnd === historyEnd) {
      setHistoryError('没有更多可用的更早日线。');
      return;
    }
    const anchor = chartIndicators[0]?.calculationAnchor?.timestamp;
    setHistoryError(null);
    setHistoryExhausted(false);
    setHistoryLoadingEnd(nextEnd);
    setHistoryCalculationAnchor(anchor?.slice(0, 10));
    setHistoryEnd(nextEnd);
  };
  const canLoadEarlier = Boolean(
    !historyExhausted &&
    (historyError ||
      visibleDetail?.barSeries?.coverage.hasMoreBefore === true),
  );
  const retryEarlier = () => {
    if (parameterRefreshEnds.length > 0 && !parameterRefreshLoading) {
      setParameterRefreshError(null);
      setParameterRefreshRevision((value) => value + 1);
      return;
    }
    if (!historyEnd || query.isFetching) return;
    setHistoryError(null);
    setHistoryLoadingEnd(historyEnd);
    void query.refetch();
  };
  const updateIndicatorParams = (next: MarketIndicatorParams) => {
    if (JSON.stringify(indicatorParams) === JSON.stringify(next)) return;
    requestGenerationRef.current += 1;
    const loadedEnds = [
      ...new Set(historyPages.filter((page) => page.end).map((page) => page.end as string)),
    ];
    setDetail((current) => clearIndicatorSections(current));
    setHistoryEnd(undefined);
    setHistoryCalculationAnchor(undefined);
    setHistoryError(null);
    setHistoryLoadingEnd(undefined);
    setHistoryExhausted(false);
    setParameterRefreshError(null);
    setParameterRefreshEnds(loadedEnds);
    setParameterRefreshRevision((value) => value + 1);
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

  const staleDescription = query.isFetching
    ? '已保留当前可见内容，正在尝试获取更新数据。'
    : '部分数据来自陈旧回退结果，仍可查看并可主动刷新。';

  return (
    <MarketDetailDialogContent
      position={position}
      unit={unit}
      queryNotice={queryNotice()}
      loading={loading}
      stale={stale}
      refreshing={query.isFetching}
      staleDescription={staleDescription}
      retryError={retryError}
      visibleDetail={visibleDetail}
      quoteSection={quoteSection}
      barsSection={barsSection}
      chartIndicators={chartIndicators}
      chartPoints={chartPoints.length > 0 ? chartPoints : undefined}
      onIndicatorParamsChange={updateIndicatorParams}
      onLoadEarlier={loadEarlier}
      canLoadEarlier={canLoadEarlier}
      historyLoading={
        parameterRefreshLoading ||
        Boolean(historyLoadingEnd) ||
        (Boolean(historyEnd) && query.isFetching)
      }
      historyError={parameterRefreshError ?? historyError}
      onRetryEarlier={retryEarlier}
      chipSection={chipSection}
      fundNavSection={fundNavSection}
      fundNavHistorySection={fundNavHistorySection}
      indicatorCapabilities={indicatorCapabilities}
      retrying={retrying}
      onRetryAll={retryAll}
      onRetrySection={retrySection}
      onClose={onClose}
    />
  );
}

function MarketDetailDialogContent({
  position,
  unit,
  queryNotice,
  loading,
  stale,
  refreshing,
  staleDescription,
  retryError,
  visibleDetail,
  quoteSection,
  barsSection,
  chartIndicators,
  chartPoints,
  onIndicatorParamsChange,
  onLoadEarlier,
  canLoadEarlier,
  historyLoading,
  historyError,
  onRetryEarlier,
  chipSection,
  fundNavSection,
  fundNavHistorySection,
  indicatorCapabilities,
  retrying,
  onRetryAll,
  onRetrySection,
  onClose,
}: {
  position: MarketDetailPosition;
  unit: string;
  queryNotice: ReactNode;
  loading: boolean;
  stale: boolean;
  refreshing: boolean;
  staleDescription: string;
  retryError: string | null;
  visibleDetail: MarketDetailResponseV2 | null;
  quoteSection: MarketDetailSectionV2 | undefined;
  barsSection: MarketDetailSectionV2 | undefined;
  chartIndicators: MarketChartIndicator[];
  chartPoints: ChartPoint[] | undefined;
  onIndicatorParamsChange: (params: MarketIndicatorParams) => void;
  onLoadEarlier: () => void;
  canLoadEarlier: boolean;
  historyLoading: boolean;
  historyError: string | null;
  onRetryEarlier: () => void;
  chipSection: MarketDetailSectionV2 | undefined;
  fundNavSection: MarketDetailSectionV2 | undefined;
  fundNavHistorySection: MarketDetailSectionV2 | undefined;
  indicatorCapabilities: MarketDetailCapability[];
  retrying: string | null;
  onRetryAll: () => void;
  onRetrySection: (capability: MarketDetailCapability) => Promise<void>;
  onClose: () => void;
}) {
  const positionPnlTone = marketToneForValue(position.pnl);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby="market-detail-description"
        className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1120px]"
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-14 text-left">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="m-0 text-xs font-medium tracking-[0.16em] text-muted-foreground">
                持仓行情
              </p>
              <DialogTitle id="market-detail-title" className="text-lg font-semibold">
                {position.asset.name} · {position.symbol}
              </DialogTitle>
            </div>
            <MarketColorMenu />
          </div>
          <DialogDescription id="market-detail-description" className="sr-only">
            查看该持仓的数量、成本和按资产能力加载的市场数据。
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5">
          <div
            className="grid rounded-lg border border-border bg-border sm:grid-cols-3 sm:gap-px"
            data-market-detail-position-context
          >
            <DetailMetric label="持仓数量" value={`${number.format(position.quantity)} ${unit}`} />
            <DetailMetric label="持仓成本" value={money.format(position.costPrice)} />
            <DetailMetric
              label="持仓盈亏"
              value={position.pnl === null ? '—' : money.format(position.pnl)}
              {...(positionPnlTone ? { tone: positionPnlTone } : {})}
            />
          </div>
          {queryNotice}
          {loading ? <MarketDetailLoadingSections /> : null}
          {stale ? (
            <MarketDetailNotice
              state="stale"
              title={refreshing ? '正在刷新行情详情' : '行情详情可能陈旧'}
              description={staleDescription}
              onRetry={onRetryAll}
            />
          ) : null}
          {retryError ? (
            <p
              className="m-0 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
              role="alert"
            >
              {retryError}
            </p>
          ) : null}
          {visibleDetail ? (
            <>
              {sectionIsVisible(quoteSection) ? (
                <QuoteSection
                  section={quoteSection}
                  onRetry={() => void onRetrySection('quote')}
                  retrying={retrying === 'quote'}
                />
              ) : null}
              {sectionIsVisible(barsSection) ? (
                <BarsSection
                  section={barsSection}
                  indicators={chartIndicators}
                  {...(chartPoints ? { chartPoints } : {})}
                  onIndicatorParamsChange={onIndicatorParamsChange}
                  onLoadEarlier={onLoadEarlier}
                  canLoadEarlier={canLoadEarlier}
                  historyLoading={historyLoading}
                  historyError={historyError}
                  onRetryEarlier={onRetryEarlier}
                  onRetry={() => void onRetrySection('bars')}
                  retrying={retrying === 'bars'}
                />
              ) : null}
              {indicatorCapabilities.length > 0 ? (
                <IndicatorSection
                  detail={visibleDetail}
                  capabilities={indicatorCapabilities}
                  onRetry={(capability) => void onRetrySection(capability)}
                  retrying={retrying}
                />
              ) : null}
              {sectionIsVisible(chipSection) ? (
                <ChipSection
                  section={chipSection}
                  onRetry={() => void onRetrySection('chip')}
                  retrying={retrying === 'chip'}
                />
              ) : null}
              {sectionIsVisible(fundNavSection) ? (
                <FundNavSection
                  section={fundNavSection}
                  onRetry={() => void onRetrySection('fund-nav')}
                  retrying={retrying === 'fund-nav'}
                />
              ) : null}
              {sectionIsVisible(fundNavHistorySection) ? (
                <FundNavHistorySection
                  section={fundNavHistorySection}
                  onRetry={() => void onRetrySection('fund-nav-history')}
                  retrying={retrying === 'fund-nav-history'}
                />
              ) : null}
              {visibleDetail.capabilities.unsupported.length > 0 ? (
                <details
                  className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground"
                  data-market-detail-capabilities
                >
                  <summary className="cursor-pointer font-medium text-foreground">
                    数据可用性
                  </summary>
                  <p className="mb-0 mt-2">
                    当前未提供：
                    {visibleDetail.capabilities.unsupported
                      .map(marketDetailSectionTitle)
                      .join('、')}
                    。不支持的能力不会触发数据源请求。
                  </p>
                </details>
              ) : null}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
