import type { ReactNode } from 'react';
import type { MarketDetailCapability, MarketDetailResponse, MarketDetailSection } from '@thesis-ledger/api-client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MarketColorMenu } from '@/components/market-color-menu';
import { marketToneForValue } from '@/ui/market-color';
import { BarsSection, ChipSection, DetailMetric, FundNavHistorySection, FundNavSection, IndicatorSection, MarketDetailLoadingSections, MarketDetailNotice, QuoteSection, sectionIsVisible, type MarketDetailNoticeState } from './MarketDetailSections.js';
import type { MarketIndicatorParams } from './MarketDetailCharts.js';
import { marketDetailSectionTitle, type MarketDetailPosition } from './market-detail.types.js';
import type { MarketChartIndicator } from './market-chart-types.js';
import type { ChartPoint } from './market-chart-model.js';
const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

export function MarketDetailDialogContent({
  chartControls,
  position,
  unit,
  queryNotice,
  loading,
  stale,
  staleNotice,
  retryError,
  visibleDetail,
  quoteUpstreamNotice,
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
  onLoadLater,
  onRetryLater,
  canLoadLater,
  latestLoading,
  latestNotice,
  latestError,
  chipSection,
  fundNavSection,
  fundNavHistorySection,
  indicatorCapabilities,
  retrying,
  onRetryAll,
  onRetrySection,
  onClose,
}: {
  chartControls?: ReactNode;
  position: MarketDetailPosition;
  unit: string;
  queryNotice: ReactNode;
  loading: boolean;
  stale: boolean;
  staleNotice: MarketDetailNoticeState;
  retryError: string | null;
  visibleDetail: MarketDetailResponse | null;
  quoteUpstreamNotice: ReactNode;
  quoteSection: MarketDetailSection | undefined;
  barsSection: MarketDetailSection | undefined;
  chartIndicators: MarketChartIndicator[];
  chartPoints: ChartPoint[] | undefined;
  onIndicatorParamsChange: (params: MarketIndicatorParams) => void;
  onLoadEarlier: () => void;
  canLoadEarlier: boolean;
  historyLoading: boolean;
  historyError: string | null;
  onRetryEarlier: () => void;
  onLoadLater: () => void;
  onRetryLater: () => void;
  canLoadLater: boolean;
  latestLoading: boolean;
  latestNotice: string | null;
  latestError: string | null;
  chipSection: MarketDetailSection | undefined;
  fundNavSection: MarketDetailSection | undefined;
  fundNavHistorySection: MarketDetailSection | undefined;
  indicatorCapabilities: MarketDetailCapability[];
  retrying: string | null;
  onRetryAll: () => void;
  onRetrySection: (capability: MarketDetailCapability) => Promise<void>;
  onClose: () => void;
}) {
  const positionPnlTone = marketToneForValue(position.pnl ?? null);

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
                行情详情
              </p>
              <DialogTitle id="market-detail-title" className="text-lg font-semibold">
                {position.asset.name} · {position.symbol}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2">{chartControls}<MarketColorMenu /></div>
          </div>
          <DialogDescription id="market-detail-description" className="sr-only">
            查看按资产能力加载的市场数据和已有持仓信息。
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5">
          {position.quantity !== undefined && position.costPrice !== undefined && (
            <div
              className="grid rounded-lg border border-border bg-border sm:grid-cols-3 sm:gap-px"
              data-market-detail-position-context
            >
              <DetailMetric label="持仓数量" value={`${number.format(position.quantity)} ${unit}`} />
              <DetailMetric label="持仓成本" value={money.format(position.costPrice)} />
              <DetailMetric
                label="持仓盈亏"
                value={position.pnl == null ? '—' : money.format(position.pnl)}
                {...(positionPnlTone ? { tone: positionPnlTone } : {})}
              />
            </div>
          )}
          {queryNotice}
          {loading ? <MarketDetailLoadingSections /> : null}
          {stale && !quoteUpstreamNotice ? (
            <MarketDetailNotice
              state={staleNotice.state}
              title={staleNotice.title}
              description={staleNotice.description}
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
                  notice={quoteUpstreamNotice ?? undefined}
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
                  onLoadLater={onLoadLater}
                  onRetryLater={onRetryLater}
                  canLoadLater={canLoadLater}
                  latestLoading={latestLoading}
                  latestNotice={latestNotice}
                  latestError={latestError}
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
