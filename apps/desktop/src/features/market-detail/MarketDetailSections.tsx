import { formatMarketNumber, formatRatioPercent, quoteFreshnessLabel } from '@thesis-ledger/domain';
import { Spinner } from '@/components/ui/spinner';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import type { ReactNode } from 'react';
import type {
  MarketDisplayBarSeries as BarSeries,
  ChipDistribution,
  FundNavHistory,
  FundNav,
  Quote,
} from '@thesis-ledger/schemas';
import type {
  MarketDetailCapability,
  MarketDisplayDetailResponse as MarketDetailResponse,
  MarketDisplayDetailSection as MarketDetailSection,
} from '@thesis-ledger/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { marketToneClass, type MarketTone } from '@/ui/market-color';
import { dataSourceDisplay } from '../market-data/market-data.types.js';
import {
  MarketPriceChart,
  type MarketIndicatorParams,
} from './MarketDetailCharts.js';
import {
  isRetryableMarketDetailSection,
  marketDetailSectionTitle,
  marketDetailStatusVariant,
  marketDetailStatusLabel,
} from './market-detail.types.js';
import type { ChartPoint } from './market-chart-model.js';
import {
  chartBarsFromSeries,
  type MarketChartIndicator,
} from './market-chart-types.js';
import {
  formatQuoteChangePercent,
  formatQuotePrice,
  quoteChangeTone,
} from './market-quote-display.js';
import { marketDetailStaleReason, quoteUpstreamWindowLabel } from './market-detail-stale-reason.js';
import { derivedSectionLabel } from './market-period-section-label.js';
import type { MarketTradingOverlayState } from './useMarketTradingOverlays.js';
import { FundNavPnlChart } from './FundNavPnlChart.js';
import { FundCurrentValuation } from './FundCurrentValuation.js';
import type { MarketDetailPosition } from './market-detail.types.js';

const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });

export const sectionIsDataReady = (section: MarketDetailSection | undefined) =>
  section?.status === 'ready' || section?.status === 'stale';

export const sectionIsVisible = (
  section: MarketDetailSection | undefined,
): section is MarketDetailSection => section !== undefined && section.status !== 'unsupported';

const renderReadyOrEmpty = (section: MarketDetailSection, ready: ReactNode, empty: ReactNode) => {
  if (sectionIsDataReady(section)) return ready;
  if (section.status === 'empty') return empty;
  return null;
};

const retryProps = (section: MarketDetailSection, onRetry: () => void) =>
  isRetryableMarketDetailSection(section) ? { onRetry } : {};

const providerOf = (data: unknown) => {
  if (!data || typeof data !== 'object') return '来源未知';
  const record: unknown = Array.isArray(data) ? data.at(-1) : data;
  if (!record || typeof record !== 'object') return '来源未知';
  const source = record as {
    provider?: unknown;
    upstreamSource?: unknown;
    provenance?: { providerId?: unknown; upstreamSource?: unknown };
  };
  let provider: string | null = null;
  if (typeof source.provider === 'string') provider = source.provider;
  else if (typeof source.provenance?.providerId === 'string') provider = source.provenance.providerId;
  if (!provider) return '来源未知';
  let upstreamSource: string | null = null;
  if (typeof source.upstreamSource === 'string') upstreamSource = source.upstreamSource;
  else if (typeof source.provenance?.upstreamSource === 'string') upstreamSource = source.provenance.upstreamSource;
  return dataSourceDisplay(
    provider,
    upstreamSource,
  );
};

export type MarketDetailNoticeState = {
  state: 'loading' | 'error' | 'stale' | 'info';
  title: string;
  description: string;
};

export const MarketDetailNotice = ({
  title,
  description,
  state,
  onRetry,
  flush = false,
}: {
  title: string;
  description: string;
  state: MarketDetailNoticeState['state'];
  onRetry?: () => void;
  /** 嵌入分段内部时去掉 banner 自带的下边距，交给分段的 grid gap 控制节奏。 */
  flush?: boolean;
}) => (
  <Alert
    className={cn('data-state-banner', state, flush && 'banner-flush')}
    role="status"
    aria-live="polite"
    aria-busy={state === 'loading'}
  >
    {state === 'loading' && <Spinner aria-hidden="true" />}
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription>
      <span className="whitespace-pre-line">{description}</span>
      {onRetry && state !== 'loading' ? (
        <RefreshIconButton label="刷新行情" refreshing={false} onClick={onRetry} />
      ) : null}
    </AlertDescription>
  </Alert>
);

export const DetailMetric = ({
  label,
  value,
  detail,
  tone,
  prominent = false,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: MarketTone;
  prominent?: boolean;
}) => (
  <div className="min-w-0 py-2">
    <span className="block text-xs text-muted-foreground">{label}</span>
    <strong
      className={cn(
        'mt-1 block break-words font-semibold tracking-tight tabular-nums',
        prominent ? 'text-3xl' : 'text-xl',
        marketToneClass(tone),
      )}
    >
      {value}
    </strong>
    {detail ? <small className="mt-1 block text-xs text-muted-foreground">{detail}</small> : null}
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
}) => {
  const upstreamWindowLabel = quoteUpstreamWindowLabel(section);
  const staleReason = upstreamWindowLabel ? null : marketDetailStaleReason(section);
  return (
    <div className="flex flex-wrap items-center gap-2" data-section-status={section.status}>
      <Badge
        variant={retrying || upstreamWindowLabel ? 'secondary' : marketDetailStatusVariant(section.status)}
      >
        {retrying ? <Spinner aria-label="正在重新读取行情" /> : (upstreamWindowLabel ?? marketDetailStatusLabel(section.status))}
      </Badge>
      {showErrorMessage && (section.error || staleReason) ? (
        <span className="text-sm text-muted-foreground">{section.error?.message ?? staleReason}</span>
      ) : null}
      {section.error?.diagnosticId ? (
        <code className="min-w-0 break-all text-xs text-muted-foreground">诊断 {section.error.diagnosticId}</code>
      ) : null}
      {onRetry && isRetryableMarketDetailSection(section) ? (
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
};

const SectionHeading = ({
  capability,
  section,
  onRetry,
  retrying,
  showErrorMessage,
}: {
  capability: MarketDetailCapability;
  section: MarketDetailSection;
  onRetry?: () => void;
  retrying: boolean;
  showErrorMessage?: boolean;
}) => {
  const title = capability === 'bars' && !sectionIsDataReady(section)
    ? '行情数据'
    : derivedSectionLabel(section.data)?.title ?? marketDetailSectionTitle(capability);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="m-0 text-sm font-medium">{title}</h3>
        {sectionIsDataReady(section) ? (
          <span className="text-xs text-muted-foreground">
            {derivedSectionLabel(section.data)?.source ?? providerOf(section.data)}
          </span>
        ) : null}
      </div>
      <SectionStatus section={section} {...(onRetry ? { onRetry } : {})} retrying={retrying} {...(showErrorMessage === undefined ? {} : { showErrorMessage })} />
    </div>
  );
};

export const QuoteSection = ({
  section,
  notice,
  onRetry,
  retrying,
}: {
  section: MarketDetailSection;
  notice?: ReactNode;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const quote = section.data as Quote | undefined;
  let quoteDetail: string | undefined;
  if (quote?.stale || quote?.sessionContext?.session === 'closed_snapshot') quoteDetail = quoteFreshnessLabel(quote);
  const quoteTone = quote ? quoteChangeTone(quote) : undefined;
  return (
    <section className="grid gap-3" data-market-detail-section="quote">
      {notice ?? null}
      <SectionHeading
        capability="quote"
        section={section}
        showErrorMessage={section.status !== 'stale'}
        {...retryProps(section, onRetry)}
        retrying={retrying}
      />
      {renderReadyOrEmpty(
        section,
        quote ? (
          <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4 sm:gap-6">
            <DetailMetric
              prominent
              label="实时价"
              value={formatQuotePrice(quote.price, quote.units?.priceCurrency)}
              {...(quoteTone ? { tone: quoteTone } : {})}
            />
            <DetailMetric
              label="涨跌幅"
              value={formatQuoteChangePercent(quote)}
              {...(quoteTone ? { tone: quoteTone } : {})}
            />
            <DetailMetric label="涨跌前收" value={formatQuotePrice(quote.previousClose, quote.units?.priceCurrency)} />
            <DetailMetric
              label="行情时点"
              value={quote.marketTime ? new Date(quote.marketTime).toLocaleString('zh-CN') : '未知'}
              {...(quoteDetail ? { detail: quoteDetail } : {})}
            />
          </div>
        ) : null,
        <p className="empty-inline">当前没有可用实时行情。</p>,
      )}
    </section>
  );
};

export const BarsSection = ({
  section,
  indicators = [],
  chartPoints,
  onIndicatorParamsChange,
  onLoadEarlier,
  canLoadEarlier,
  historyLoading,
  historyError,
  onRetryEarlier,
  onLoadLater,
  onRetryLater,
  canLoadLater,
  latestLoading,
  latestNotice,
  latestError,
  onRetry,
  retrying,
  tradingOverlay,
}: {
  section: MarketDetailSection;
  indicators?: MarketChartIndicator[];
  chartPoints?: ChartPoint[];
  onIndicatorParamsChange?: (params: MarketIndicatorParams) => void;
  onLoadEarlier?: (start?: string) => void;
  canLoadEarlier?: boolean;
  historyLoading?: boolean;
  historyError?: string | null;
  onRetryEarlier?: () => void;
  onLoadLater?: () => void;
  onRetryLater?: () => void;
  canLoadLater?: boolean;
  latestLoading?: boolean;
  latestNotice?: string | null;
  latestError?: string | null;
  onRetry: () => void;
  retrying: boolean;
  tradingOverlay?: MarketTradingOverlayState | undefined;
}) => {
  const series = section.data as BarSeries | undefined;
  const bars = sectionIsDataReady(section) && series ? chartBarsFromSeries(series) : [];
  return (
    <section className="grid min-w-0 grid-cols-1 gap-3" data-market-detail-section="bars">
      <SectionHeading
        capability="bars"
        section={section}
        {...retryProps(section, onRetry)}
        retrying={retrying}
      />
      {renderReadyOrEmpty(
        section,
        bars.length > 0 ? (
          <MarketPriceChart
            bars={bars}
            tradingOverlay={tradingOverlay}
            indicators={indicators}
            {...(chartPoints ? { chartPoints } : {})}
            {...(onIndicatorParamsChange ? { onIndicatorParamsChange } : {})}
            {...(onLoadEarlier ? { onLoadEarlier } : {})}
            {...(canLoadEarlier !== undefined ? { canLoadEarlier } : {})}
            {...(historyLoading !== undefined ? { historyLoading } : {})}
            {...(historyError !== undefined ? { historyError } : {})}
            {...(onRetryEarlier ? { onRetryEarlier } : {})}
            {...(onLoadLater ? { onLoadLater } : {})}
            {...(onRetryLater ? { onRetryLater } : {})}
            {...(canLoadLater !== undefined ? { canLoadLater } : {})}
            {...(latestLoading !== undefined ? { latestLoading } : {})}
            {...(latestNotice !== undefined ? { latestNotice } : {})}
            {...(latestError !== undefined ? { latestError } : {})}
          />
        ) : null,
        <p className="empty-inline">当前没有可用行情。</p>,
      )}
    </section>
  );
};

export const IndicatorSection = ({
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
  const firstProblem = sections.find(({ section }) => section.status !== 'ready');
  const missingHistory = sections.filter(({ section }) => {
    if (!sectionIsDataReady(section)) return false;
    const data = section.data as { points?: readonly unknown[] } | null | undefined;
    return !data?.points || data.points.length === 0;
  });
  if (sections.length === 0 || (!firstProblem && missingHistory.length === 0)) return null;
  return (
    <section
      className="grid gap-3"
      data-market-detail-section="indicators"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-sm font-medium">技术指标</h3>
        </div>
        {firstProblem ? (
          <SectionStatus
            section={firstProblem.section}
            {...retryProps(firstProblem.section, () => onRetry(firstProblem.capability))}
            retrying={retrying === firstProblem.capability}
          />
        ) : null}
      </div>
      {firstProblem?.section.status === 'empty' ? (
        <p className="empty-inline">技术指标暂无数据。</p>
      ) : null}
      {missingHistory.length > 0 ? (
        <p className="m-0 text-xs text-destructive" role="alert">
          {missingHistory.map(({ capability }) => marketDetailSectionTitle(capability)).join('、')}
          缺少历史序列或日线口径证据，暂不叠加到图表。{' '}
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto p-0"
            onClick={() => onRetry(missingHistory[0]!.capability)}
          >
            重试
          </Button>
        </p>
      ) : null}
    </section>
  );
};

export const ChipSection = ({
  section,
  onRetry,
  retrying,
}: {
    section: MarketDetailSection;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const chip = section.data as ChipDistribution | undefined;
  return (
    <section className="grid gap-3" data-market-detail-section="chip">
      <SectionHeading
        capability="chip"
        section={section}
        {...retryProps(section, onRetry)}
        retrying={retrying}
      />
      {renderReadyOrEmpty(
        section,
        chip ? (
          <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
            <DetailMetric label="平均成本" value={money.format(chip.averageCost)} />
            <DetailMetric label="获利比例" value={formatRatioPercent(chip.profitRatio)} />
            <DetailMetric label="集中度" value={formatRatioPercent(chip.concentration)} />
          </div>
        ) : null,
        <p className="empty-inline">当前没有可用筹码摘要。</p>,
      )}
    </section>
  );
};

export const FundNavSection = ({
  section,
  onRetry,
  retrying,
}: {
  section: MarketDetailSection;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const nav = section.data as FundNav | undefined;
  return (
    <section
      className="grid gap-3"
      data-market-detail-section="fund-nav"
    >
      <SectionHeading
        capability="fund-nav"
        section={section}
        {...retryProps(section, onRetry)}
        retrying={retrying}
      />
      {renderReadyOrEmpty(
        section,
        nav ? (
          <div className="grid max-w-lg grid-cols-2 items-start gap-x-4">
            <DetailMetric prominent label="单位净值" value={formatMarketNumber(nav.unitNav)}
              detail={`净值日期 · ${new Date(nav.navDate).toLocaleDateString('zh-CN')}`} />
            <FundCurrentValuation symbol={nav.symbol} />
            <small className="col-span-2 text-xs text-muted-foreground">
              抓取时间 · {new Date(nav.fetchedAt).toLocaleString('zh-CN')}
            </small>
          </div>
        ) : null,
        <p className="empty-inline">当前没有可用基金净值。</p>,
      )}
    </section>
  );
};

export const FundNavHistorySection = ({
  position,
  section,
  onRetry,
  retrying,
}: {
  position?: MarketDetailPosition;
  section: MarketDetailSection;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const history = (section.data as FundNavHistory | undefined) ?? [];
  return (
    <section
      className="grid gap-3"
      data-market-detail-section="fund-nav-history"
    >
      <SectionHeading
        capability="fund-nav-history"
        section={section}
        {...retryProps(section, onRetry)}
        retrying={retrying}
      />
      {renderReadyOrEmpty(
        section,
        history.length > 0 ? <FundNavPnlChart history={history} position={position} /> : null,
        <p className="empty-inline">当前没有可用净值历史。</p>,
      )}
    </section>
  );
};
