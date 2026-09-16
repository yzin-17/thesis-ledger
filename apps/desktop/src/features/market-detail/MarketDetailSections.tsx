import type { ReactNode } from 'react';
import type {
  BarSeriesV2,
  ChipDistributionV1,
  FundNavHistoryV1,
  FundNavV1,
  QuoteV1,
} from '@thesis-ledger/schemas';
import type {
  MarketDetailCapability,
  MarketDetailResponseV2,
  MarketDetailSectionV2,
} from '@thesis-ledger/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { marketToneClass, type MarketTone } from '@/ui/market-color';
import { dataSourceDisplay } from '../market-data/market-data.types.js';
import {
  FundNavHistoryChart,
  MarketPriceChart,
  type MarketIndicatorParams,
} from './MarketDetailCharts.js';
import {
  isRetryableMarketDetailSection,
  marketDetailSectionTitle,
  marketDetailStatusClass,
  marketDetailStatusLabel,
} from './market-detail.types.js';
import type { ChartPoint } from './market-chart-model.js';
import {
  chartBarsFromSeries,
  type MarketChartIndicator,
} from './market-chart-types.js';

const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

export const sectionIsDataReady = (section: MarketDetailSectionV2 | undefined) =>
  section?.status === 'ready' || section?.status === 'stale';

export const sectionIsVisible = (
  section: MarketDetailSectionV2 | undefined,
): section is MarketDetailSectionV2 => section !== undefined && section.status !== 'unsupported';

const renderReadyOrEmpty = (section: MarketDetailSectionV2, ready: ReactNode, empty: ReactNode) => {
  if (sectionIsDataReady(section)) return ready;
  if (section.status === 'empty') return empty;
  return null;
};

const retryProps = (section: MarketDetailSectionV2, onRetry: () => void) =>
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

export const MarketDetailNotice = ({
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
    className={cn('data-state-banner', state)}
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

export const MarketDetailLoadingSections = () => (
  <div className="grid gap-4" data-market-detail-loading aria-label="行情分段加载中">
    {['行情数据', '技术指标', '资产专属数据'].map((label) => (
      <section key={label} className="grid gap-3 border-t border-border pt-4" aria-busy="true">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-sm font-medium">{label}</h3>
            <p className="mb-0 mt-1 text-xs text-muted-foreground">正在加载该分段数据。</p>
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

export const DetailMetric = ({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: MarketTone;
}) => (
  <div className="bg-card p-4">
    <span className="block text-xs text-muted-foreground">{label}</span>
    <strong
      className={cn(
        'mt-1 block text-xl font-semibold tracking-tight tabular-nums',
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
  section: MarketDetailSectionV2;
  onRetry?: () => void;
  retrying: boolean;
  showErrorMessage?: boolean;
}) => (
  <div className="flex flex-wrap items-center gap-2" data-section-status={section.status}>
    <Badge
      className={cn(retrying ? 'tag' : marketDetailStatusClass(section.status))}
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
  section: MarketDetailSectionV2;
  onRetry?: () => void;
  retrying: boolean;
}) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h3 className="m-0 text-sm font-medium">{marketDetailSectionTitle(capability)}</h3>
      {sectionIsDataReady(section) ? (
        <p className="mb-0 mt-1 text-xs text-muted-foreground">
          数据来自 {providerOf(section.data)}
        </p>
      ) : null}
    </div>
    <SectionStatus section={section} {...(onRetry ? { onRetry } : {})} retrying={retrying} />
  </div>
);

export const QuoteSection = ({
  section,
  onRetry,
  retrying,
}: {
  section: MarketDetailSectionV2;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const quote = section.data as QuoteV1 | undefined;
  return (
    <section className="grid gap-3 border-t border-border pt-4" data-market-detail-section="quote">
      <SectionHeading
        capability="quote"
        section={section}
        {...retryProps(section, onRetry)}
        retrying={retrying}
      />
      {renderReadyOrEmpty(
        section,
        quote ? (
          <div className="grid rounded-lg border border-border bg-border sm:grid-cols-3 sm:gap-px">
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
  onRetry,
  retrying,
}: {
  section: MarketDetailSectionV2;
  indicators?: MarketChartIndicator[];
  chartPoints?: ChartPoint[];
  onIndicatorParamsChange?: (params: MarketIndicatorParams) => void;
  onLoadEarlier?: () => void;
  canLoadEarlier?: boolean;
  historyLoading?: boolean;
  historyError?: string | null;
  onRetryEarlier?: () => void;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const series = section.data as BarSeriesV2 | undefined;
  const bars = series ? chartBarsFromSeries(series) : [];
  return (
    <section className="grid gap-3 border-t border-border pt-4" data-market-detail-section="bars">
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
            indicators={indicators}
            {...(chartPoints ? { chartPoints } : {})}
            {...(onIndicatorParamsChange ? { onIndicatorParamsChange } : {})}
            {...(onLoadEarlier ? { onLoadEarlier } : {})}
            {...(canLoadEarlier !== undefined ? { canLoadEarlier } : {})}
            {...(historyLoading !== undefined ? { historyLoading } : {})}
            {...(historyError !== undefined ? { historyError } : {})}
            {...(onRetryEarlier ? { onRetryEarlier } : {})}
          />
        ) : null,
        <p className="empty-inline">当前没有可用日线。</p>,
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
  detail: MarketDetailResponseV2;
  capabilities: readonly MarketDetailCapability[];
  onRetry: (capability: MarketDetailCapability) => void;
  retrying: string | null;
}) => {
  const sections = capabilities
    .map((capability) => ({ capability, section: detail.sections[capability] }))
    .filter(({ section }) => section !== undefined) as Array<{
    capability: MarketDetailCapability;
    section: MarketDetailSectionV2;
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
      className="grid gap-3 border-t border-border pt-4"
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
    section: MarketDetailSectionV2;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const chip = section.data as ChipDistributionV1 | undefined;
  return (
    <section className="grid gap-3 border-t border-border pt-4" data-market-detail-section="chip">
      <SectionHeading
        capability="chip"
        section={section}
        {...retryProps(section, onRetry)}
        retrying={retrying}
      />
      {renderReadyOrEmpty(
        section,
        chip ? (
          <div className="grid rounded-lg border border-border bg-border sm:grid-cols-3 sm:gap-px">
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

export const FundNavSection = ({
  section,
  onRetry,
  retrying,
}: {
  section: MarketDetailSectionV2;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const nav = section.data as FundNavV1 | undefined;
  return (
    <section
      className="grid gap-3 border-t border-border pt-4"
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
          <div className="grid rounded-lg border border-border bg-border sm:grid-cols-3 sm:gap-px">
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

export const FundNavHistorySection = ({
  section,
  onRetry,
  retrying,
}: {
  section: MarketDetailSectionV2;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const history = (section.data as FundNavHistoryV1 | undefined) ?? [];
  return (
    <section
      className="grid gap-3 border-t border-border pt-4"
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
        history.length > 0 ? <FundNavHistoryChart history={history} /> : null,
        <p className="empty-inline">当前没有可用净值历史。</p>,
      )}
    </section>
  );
};
