import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BarV1,
  ChipDistributionV1,
  FundNavHistoryV1,
  FundNavV1,
  IndicatorV1,
  QuoteV1,
} from '@thesis-ledger/schemas';
import type {
  MarketDetailCapability,
  MarketDetailResponse,
  MarketDetailSection,
} from '@thesis-ledger/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
  isRetryableMarketDetailSection,
  marketDetailSectionTitle,
  marketDetailStatusClass,
  marketDetailStatusLabel,
  mergeMarketDetail,
  getVisibleMarketDetail,
  type MarketDetailPosition,
} from './market-detail.types.js';

const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

const detailQueryKey = (symbol: string, refreshSequence: number) =>
  ['desktop', 'market-detail', symbol, refreshSequence] as const;

const sectionIsDataReady = (section: MarketDetailSection | undefined) =>
  section?.status === 'ready' || section?.status === 'stale';

const sectionIsVisible = (
  section: MarketDetailSection | undefined,
): section is MarketDetailSection => section !== undefined && section.status !== 'unsupported';

const renderReadyOrEmpty = (section: MarketDetailSection, ready: ReactNode, empty: ReactNode) => {
  if (sectionIsDataReady(section)) return ready;
  if (section.status === 'empty') return empty;
  return null;
};

const retryProps = (section: MarketDetailSection, onRetry: () => void) =>
  isRetryableMarketDetailSection(section) ? { onRetry } : {};

const providerOf = (data: unknown) =>
  data && typeof data === 'object' && typeof (data as { provider?: unknown }).provider === 'string'
    ? String((data as { provider: string }).provider)
    : '来源未知';

const MarketDetailNotice = ({
  title,
  description,
  state,
  onRetry,
}: {
  title: string;
  description: string;
  state: 'loading' | 'error' | 'stale';
  onRetry?: () => void;
}) => (
  <Alert
    className={`data-state-banner ${state}`}
    role="status"
    aria-live="polite"
    aria-busy={state === 'loading'}
  >
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription>
      <span>{description}</span>
      {onRetry && state !== 'loading' ? (
        <Button className="text-button" size="sm" type="button" variant="link" onClick={onRetry}>
          重新加载
        </Button>
      ) : null}
    </AlertDescription>
  </Alert>
);

const MarketDetailLoadingSections = () => (
  <div className="grid gap-4" data-market-detail-loading aria-label="行情分段加载中">
    {['行情数据', '技术指标', '资产专属数据'].map((label) => (
      <section key={label} className="panel" aria-busy="true">
        <div className="panel-heading">
          <div>
            <h3>{label}</h3>
            <p>正在加载该分段数据。</p>
          </div>
          <Badge className="tag" variant="secondary">
            加载中
          </Badge>
        </div>
        <div className="skeleton table" aria-hidden="true" />
      </section>
    ))}
  </div>
);

const DetailMetric = ({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) => (
  <div className="metric">
    <span>{label}</span>
    <strong>{value}</strong>
    {detail ? <small>{detail}</small> : null}
  </div>
);

const SectionStatus = ({
  section,
  onRetry,
  retrying,
  showErrorMessage = true,
}: {
  section: MarketDetailSection;
  onRetry?: () => void;
  retrying: boolean;
  showErrorMessage?: boolean;
}) => (
  <div className="flex flex-wrap items-center gap-2" data-section-status={section.status}>
    <Badge
      className={retrying ? 'tag' : marketDetailStatusClass(section.status)}
      variant="secondary"
    >
      {retrying ? '加载中' : marketDetailStatusLabel(section.status)}
    </Badge>
    {showErrorMessage && section.error ? (
      <span className="text-sm text-muted-foreground">{section.error.message}</span>
    ) : null}
    {section.error?.diagnosticId ? (
      <code className="text-xs text-muted-foreground">诊断 {section.error.diagnosticId}</code>
    ) : null}
    {onRetry ? (
      <Button
        className="text-button"
        disabled={retrying}
        size="sm"
        type="button"
        variant="link"
        onClick={onRetry}
      >
        {retrying ? '重试中…' : '重试'}
      </Button>
    ) : null}
  </div>
);

const SectionHeading = ({
  capability,
  section,
  onRetry,
  retrying,
}: {
  capability: MarketDetailCapability;
  section: MarketDetailSection;
  onRetry?: () => void;
  retrying: boolean;
}) => (
  <div className="panel-heading">
    <div>
      <h3>{marketDetailSectionTitle(capability)}</h3>
      {sectionIsDataReady(section) ? <p>数据来自 {providerOf(section.data)}</p> : null}
    </div>
    <SectionStatus section={section} {...(onRetry ? { onRetry } : {})} retrying={retrying} />
  </div>
);

const QuoteSection = ({
  section,
  onRetry,
  retrying,
}: {
  section: MarketDetailSection;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const quote = section.data as QuoteV1 | undefined;
  return (
    <section className="panel" data-market-detail-section="quote">
      <SectionHeading
        capability="quote"
        section={section}
        {...retryProps(section, onRetry)}
        retrying={retrying}
      />
      {renderReadyOrEmpty(
        section,
        quote ? (
          <div className="detail-metrics">
            <DetailMetric label="实时价" value={money.format(quote.price)} />
            <DetailMetric label="涨跌前收" value={money.format(quote.previousClose)} />
            <DetailMetric
              label="行情时点"
              value={new Date(quote.marketTime).toLocaleString('zh-CN')}
              {...(quote.stale ? { detail: '陈旧回退' } : {})}
            />
          </div>
        ) : null,
        <p className="empty-inline">当前没有可用实时行情。</p>,
      )}
    </section>
  );
};

const BarsSection = ({
  section,
  onRetry,
  retrying,
}: {
  section: MarketDetailSection;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const bars = (section.data as BarV1[] | undefined) ?? [];
  return (
    <section className="panel" data-market-detail-section="bars">
      <SectionHeading
        capability="bars"
        section={section}
        {...retryProps(section, onRetry)}
        retrying={retrying}
      />
      {renderReadyOrEmpty(
        section,
        bars.length > 0 ? (
          <div className="bar-strip">
            {bars.slice(-10).map((bar) => (
              <div key={bar.timestamp}>
                <span>{new Date(bar.timestamp).toLocaleDateString('zh-CN')}</span>
                <strong>{number.format(bar.close)}</strong>
                <small>{bar.provider}</small>
              </div>
            ))}
          </div>
        ) : null,
        <p className="empty-inline">当前没有可用日线。</p>,
      )}
    </section>
  );
};

const IndicatorSection = ({
  detail,
  capabilities,
  onRetry,
  retrying,
}: {
  detail: MarketDetailResponse;
  capabilities: readonly MarketDetailCapability[];
  onRetry: (capability: MarketDetailCapability) => void;
  retrying: string | null;
}) => {
  const sections = capabilities
    .map((capability) => ({ capability, section: detail.sections[capability] }))
    .filter(({ section }) => section !== undefined) as Array<{
    capability: MarketDetailCapability;
    section: MarketDetailSection;
  }>;
  const firstFailure = sections.find(({ section }) => section.status === 'unavailable');
  const allUnavailable =
    sections.length > 0 && sections.every(({ section }) => section.status === 'unavailable');
  const renderIndicator = ({
    capability,
    section,
  }: {
    capability: MarketDetailCapability;
    section: MarketDetailSection;
  }) => {
    const indicator = section.data as IndicatorV1 | undefined;
    return (
      <div key={capability}>
        <span>{capability.slice('indicator:'.length)}</span>
        <SectionStatus
          section={section}
          {...retryProps(section, () => onRetry(capability))}
          retrying={retrying === capability}
          {...(allUnavailable ? { showErrorMessage: false } : {})}
        />
        {indicator && sectionIsDataReady(section) ? (
          <strong>
            {Object.entries(indicator.values)
              .map(
                ([key, value]) => `${key} ${Array.isArray(value) ? value.join(', ') : value}`,
              )
              .join(' · ')}
          </strong>
        ) : null}
      </div>
    );
  };
  return (
    <section className="panel" data-market-detail-section="indicators">
      <div className="panel-heading">
        <div>
          <h3>技术指标</h3>
          <p>MA、MACD、RSI 共享日线依赖。</p>
        </div>
        {!allUnavailable && firstFailure ? (
          <SectionStatus
            section={firstFailure.section}
            {...retryProps(firstFailure.section, () => onRetry(firstFailure.capability))}
            retrying={retrying === firstFailure.capability}
          />
        ) : null}
      </div>
      {allUnavailable ? (
        <>
          <p className="empty-inline">
            {firstFailure?.section.error?.message ?? '技术指标暂时不可用。'}
          </p>
          <div className="indicator-grid">{sections.map(renderIndicator)}</div>
        </>
      ) : (
        <div className="indicator-grid">{sections.map(renderIndicator)}</div>
      )}
    </section>
  );
};

const ChipSection = ({
  section,
  onRetry,
  retrying,
}: {
  section: MarketDetailSection;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const chip = section.data as ChipDistributionV1 | undefined;
  return (
    <section className="panel" data-market-detail-section="chip">
      <SectionHeading
        capability="chip"
        section={section}
        {...retryProps(section, onRetry)}
        retrying={retrying}
      />
      {renderReadyOrEmpty(
        section,
        chip ? (
          <div className="detail-metrics">
            <DetailMetric label="平均成本" value={money.format(chip.averageCost)} />
            <DetailMetric label="获利比例" value={`${(chip.profitRatio * 100).toFixed(2)}%`} />
            <DetailMetric label="集中度" value={`${(chip.concentration * 100).toFixed(2)}%`} />
          </div>
        ) : null,
        <p className="empty-inline">当前没有可用筹码摘要。</p>,
      )}
    </section>
  );
};

const FundNavSection = ({
  section,
  onRetry,
  retrying,
}: {
  section: MarketDetailSection;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const nav = section.data as FundNavV1 | undefined;
  return (
    <section className="panel" data-market-detail-section="fund-nav">
      <SectionHeading
        capability="fund-nav"
        section={section}
        {...retryProps(section, onRetry)}
        retrying={retrying}
      />
      {renderReadyOrEmpty(
        section,
        nav ? (
          <div className="detail-metrics">
            <DetailMetric label="单位净值" value={number.format(nav.unitNav)} />
            <DetailMetric
              label="净值日期"
              value={new Date(nav.navDate).toLocaleDateString('zh-CN')}
            />
            <DetailMetric
              label="抓取时间"
              value={new Date(nav.fetchedAt).toLocaleString('zh-CN')}
            />
          </div>
        ) : null,
        <p className="empty-inline">当前没有可用基金净值。</p>,
      )}
    </section>
  );
};

const FundNavHistorySection = ({
  section,
  onRetry,
  retrying,
}: {
  section: MarketDetailSection;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const history = (section.data as FundNavHistoryV1 | undefined) ?? [];
  return (
    <section className="panel" data-market-detail-section="fund-nav-history">
      <SectionHeading
        capability="fund-nav-history"
        section={section}
        {...retryProps(section, onRetry)}
        retrying={retrying}
      />
      {renderReadyOrEmpty(
        section,
        history.length > 0 ? (
          <div className="bar-strip">
            {history.slice(-10).map((point) => (
              <div key={point.navDate}>
                <span>{new Date(point.navDate).toLocaleDateString('zh-CN')}</span>
                <strong>{number.format(point.unitNav)}</strong>
                <small>{point.provider}</small>
              </div>
            ))}
          </div>
        ) : null,
        <p className="empty-inline">当前没有可用净值历史。</p>,
      )}
    </section>
  );
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
            {
              symbol,
              include: [capability],
              barsLimit: 30,
              navLimit: 30,
              refresh: true,
            },
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby="market-detail-description"
        className="detail-panel max-h-[calc(100dvh-64px)] max-w-[980px] overflow-auto"
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

        {queryNotice()}
        {loading ? <MarketDetailLoadingSections /> : null}
        {stale ? (
          <MarketDetailNotice
            state="stale"
            title={query.isFetching ? '正在刷新行情详情' : '行情详情可能陈旧'}
            description={staleDescription}
            onRetry={retryAll}
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
                onRetry={() => void retrySection('quote')}
                retrying={retrying === 'quote'}
              />
            ) : null}
            {sectionIsVisible(barsSection) ? (
              <BarsSection
                section={barsSection}
                onRetry={() => void retrySection('bars')}
                retrying={retrying === 'bars'}
              />
            ) : null}
            {indicatorCapabilities.length > 0 ? (
              <IndicatorSection
                detail={visibleDetail}
                capabilities={indicatorCapabilities}
                onRetry={(capability) => void retrySection(capability)}
                retrying={retrying}
              />
            ) : null}
            {sectionIsVisible(chipSection) ? (
              <ChipSection
                section={chipSection}
                onRetry={() => void retrySection('chip')}
                retrying={retrying === 'chip'}
              />
            ) : null}
            {sectionIsVisible(fundNavSection) ? (
              <FundNavSection
                section={fundNavSection}
                onRetry={() => void retrySection('fund-nav')}
                retrying={retrying === 'fund-nav'}
              />
            ) : null}
            {sectionIsVisible(fundNavHistorySection) ? (
              <FundNavHistorySection
                section={fundNavHistorySection}
                onRetry={() => void retrySection('fund-nav-history')}
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
