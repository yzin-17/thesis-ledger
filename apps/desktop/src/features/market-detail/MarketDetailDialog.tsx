import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MarketDetailCapability,
  MarketDetailResponse,
  MarketDetailSection,
} from '@thesis-ledger/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  marketDetailSectionTitle,
  mergeMarketDetail,
  getVisibleMarketDetail,
  type MarketDetailPosition,
} from './market-detail.types.js';

const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

const detailQueryKey = (symbol: string, refreshSequence: number) =>
  ['desktop', 'market-detail', symbol, refreshSequence] as const;

export function MarketDetailDialog({
  position,
  onClose,
}: {
  position: MarketDetailPosition;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [detail, setDetail] = useState<MarketDetailResponse | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const pendingRefreshSequenceRef = useRef<number | null>(null);
  const activeSymbolRef = useRef(position.symbol);
  const retryQueryKeysRef = useRef<Array<readonly unknown[]>>([]);
  const query = useQuery({
    queryKey: detailQueryKey(position.symbol, refreshSequence),
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const refresh = pendingRefreshSequenceRef.current === refreshSequence;
      if (refresh) pendingRefreshSequenceRef.current = null;
      return requestMarketDetail(
        {
          symbol: position.symbol,
          barsLimit: 30,
          navLimit: 30,
          ...(refresh ? { refresh: true } : {}),
        },
        signal,
      );
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    activeSymbolRef.current = position.symbol;
    setDetail(null);
    setRetryError(null);
    pendingRefreshSequenceRef.current = null;
    return () => {
      for (const queryKey of retryQueryKeysRef.current)
        void queryClient.cancelQueries({ queryKey });
      retryQueryKeysRef.current = [];
    };
  }, [position.symbol, queryClient]);

  useEffect(() => {
    if (query.data && query.data.symbol === activeSymbolRef.current)
      setDetail((current) => mergeMarketDetail(current, query.data));
  }, [query.data]);

  const visibleDetail = getVisibleMarketDetail(detail, query.data, position.symbol);
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
    const queryKey = ['desktop', 'market-detail', symbol, 'section', capability] as const;
    retryQueryKeysRef.current.push(queryKey);
    setRetrying(capability);
    setRetryError(null);
    try {
      const next = await queryClient.fetchQuery({
        queryKey,
        queryFn: ({ signal }) =>
          requestMarketDetail(
            { symbol, include: [capability], barsLimit: 30, navLimit: 30, refresh: true },
            signal,
          ),
        staleTime: 0,
      });
      if (activeSymbolRef.current === symbol && next.symbol === symbol)
        setDetail((current) => mergeMarketDetail(current, next));
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      if (!aborted && activeSymbolRef.current === symbol)
        setRetryError(`${marketDetailSectionTitle(capability)}重试失败，请稍后再试。`);
    } finally {
      retryQueryKeysRef.current = retryQueryKeysRef.current.filter(
        (activeKey) => activeKey !== queryKey,
      );
      if (activeSymbolRef.current === symbol) setRetrying(null);
    }
  };

  const unit = position.asset.assetType === 'stock' ? '股' : '份';
  const quoteSection = visibleDetail?.sections.quote;
  const barsSection = visibleDetail?.sections.bars;
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
  visibleDetail: MarketDetailResponse | null;
  quoteSection: MarketDetailSection | undefined;
  barsSection: MarketDetailSection | undefined;
  chipSection: MarketDetailSection | undefined;
  fundNavSection: MarketDetailSection | undefined;
  fundNavHistorySection: MarketDetailSection | undefined;
  indicatorCapabilities: MarketDetailCapability[];
  retrying: string | null;
  onRetryAll: () => void;
  onRetrySection: (capability: MarketDetailCapability) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby="market-detail-description"
        className="detail-panel max-h-[calc(100dvh-64px)] max-w-[calc(100%-2rem)] overflow-auto sm:max-w-[1200px]"
        showCloseButton={false}
      >
        <div className="review-heading">
          <div>
            <p className="kicker">持仓行情详情</p>
            <DialogTitle id="market-detail-title">
              {position.asset.name} · {position.symbol}
            </DialogTitle>
          </div>
          <DialogClose render={<Button className="secondary" type="button" variant="outline" />}>
            关闭
          </DialogClose>
        </div>
        <DialogDescription id="market-detail-description" className="sr-only">
          查看该持仓的数量、成本和按资产能力加载的市场数据。
        </DialogDescription>
        <div className="detail-metrics" data-market-detail-position-context>
          <DetailMetric label="持仓数量" value={`${number.format(position.quantity)} ${unit}`} />
          <DetailMetric label="持仓成本" value={money.format(position.costPrice)} />
          <DetailMetric
            label="持仓盈亏"
            value={position.pnl === null ? '—' : money.format(position.pnl)}
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
          <p className="notice" role="alert">
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
              <details className="notice" data-market-detail-capabilities>
                <summary>数据可用性</summary>
                <p>
                  当前未提供：
                  {visibleDetail.capabilities.unsupported.map(marketDetailSectionTitle).join('、')}
                  。 不支持的能力不会触发 Provider 请求。
                </p>
              </details>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
