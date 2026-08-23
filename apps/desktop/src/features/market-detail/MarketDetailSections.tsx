import type { ReactNode } from 'react';
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
import { cn } from '@/lib/utils';
import {
  isRetryableMarketDetailSection,
  marketDetailSectionTitle,
  marketDetailStatusClass,
  marketDetailStatusLabel,
} from './market-detail.types.js';

const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

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

const providerOf = (data: unknown) =>
  data && typeof data === 'object' && typeof (data as { provider?: unknown }).provider === 'string'
    ? String((data as { provider: string }).provider)
    : '来源未知';

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

export const DetailMetric = ({
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

export const QuoteSection = ({
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

export const BarsSection = ({
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
  const firstFailure = sections.find(({ section }) => section.status === 'unavailable');
  const allUnavailable =
    sections.length > 0 && sections.every(({ section }) => section.status === 'unavailable');
  const renderIndicator = ({ capability, section }: (typeof sections)[number]) => {
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
              .map(([key, value]) => `${key} ${Array.isArray(value) ? value.join(', ') : value}`)
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
        <p className="empty-inline">
          {firstFailure?.section.error?.message ?? '技术指标暂时不可用。'}
        </p>
      ) : null}
      <div className="indicator-grid">{sections.map(renderIndicator)}</div>
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

export const FundNavSection = ({
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

export const FundNavHistorySection = ({
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
