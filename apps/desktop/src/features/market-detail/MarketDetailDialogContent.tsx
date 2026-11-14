import { LoadingState } from '@/components/ui/spinner';
import { MarketDetailSecurityInfo } from './MarketDetailSecurityInfo.js';
import { MarketDetailPositionContext } from './MarketDetailPositionContext.js';
import { InstrumentReadingSidebar, ReadingSidebarToggle, InstrumentReadingSheet, useNarrowMarketDetail } from './MarketDetailReading.js';
import { useId, useState, type ReactNode } from 'react';
import type { MarketDetailCapability, MarketDisplayDetailResponse as MarketDetailResponse, MarketDisplayDetailSection as MarketDetailSection } from '@thesis-ledger/api-client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {FundDailyComparison} from './FundDailyComparison.js';
import { BarsSection, ChipSection, FundNavHistorySection, FundNavSection, IndicatorSection, MarketDetailNotice, QuoteSection, sectionIsVisible, type MarketDetailNoticeState } from './MarketDetailSections.js';
import type { MarketIndicatorParams } from './MarketDetailCharts.js';
import { marketDetailSectionTitle, type MarketDetailPosition } from './market-detail.types.js';
import type { MarketChartIndicator } from './market-chart-types.js';
import type { ChartPoint } from './market-chart-model.js';
import type { MarketTradingOverlayState } from './useMarketTradingOverlays.js';

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
  quoteInfoNotice,
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
  onRetrySection,
  onClose,
  tradingOverlay,
}: {
  chartControls?: ReactNode;
  position: MarketDetailPosition;
  tradingOverlay?: MarketTradingOverlayState | undefined;
  unit: string;
  queryNotice: ReactNode;
  loading: boolean;
  stale: boolean;
  staleNotice: MarketDetailNoticeState;
  retryError: string | null;
  visibleDetail: MarketDetailResponse | null;
  quoteInfoNotice: ReactNode;
  quoteSection: MarketDetailSection | undefined;
  barsSection: MarketDetailSection | undefined;
  chartIndicators: MarketChartIndicator[];
  chartPoints: ChartPoint[] | undefined;
  onIndicatorParamsChange: (params: MarketIndicatorParams) => void;
  onLoadEarlier: (start?: string) => void;
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
  onRetrySection: (capability: MarketDetailCapability) => Promise<void>;
  onClose: () => void;
}) {
  const narrow = useNarrowMarketDetail();
  const readingId = useId();
  const [sidebar, setSidebar] = useState<'unopened' | 'open' | 'closed'>('unopened');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby="market-detail-description"
        className="flex h-dvh max-h-dvh max-w-full rounded-none md:h-auto md:max-h-[calc(100dvh-2rem)] md:rounded-xl flex-col gap-0 overflow-hidden p-0 md:max-w-[min(1280px,calc(100%-2rem))]"
      >
        <DialogHeader className="shrink-0 border-b px-4 py-4 pr-14 text-left sm:px-5 sm:pr-14">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle id="market-detail-title" className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xl font-semibold leading-tight tracking-tight">
                <span>{position.asset.name}</span>
                <span className="text-sm font-normal tracking-normal text-muted-foreground">{position.symbol}</span>
              </DialogTitle>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {chartControls}
              {!narrow && <ReadingSidebarToggle
                open={sidebar === 'open'} controls={readingId}
                onToggle={() => setSidebar(sidebar === 'open' ? 'closed' : 'open')}
              />}
            </div>
          </div>
          <DialogDescription id="market-detail-description" className="sr-only">
            行情详情：市场数据与持仓信息。
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="grid min-h-0 min-w-0 flex-1 auto-rows-max grid-cols-1 gap-4 overflow-y-auto p-4 sm:gap-5 sm:px-5">
            {queryNotice}
            {position.asset?.assetType==='fund' && <FundDailyComparison symbol={position.symbol}/>}
            {loading ? <LoadingState label="行情分段加载中" /> : null}
            {stale && !quoteInfoNotice ? (
              <MarketDetailNotice
                state={staleNotice.state}
                title={staleNotice.title}
                description={staleNotice.description}
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
                    notice={quoteInfoNotice ?? undefined}
                    onRetry={() => void onRetrySection('quote')}
                    retrying={retrying === 'quote'}
                  />
                ) : null}
                {sectionIsVisible(barsSection) ? (
                  <BarsSection
                    section={barsSection}
                    tradingOverlay={tradingOverlay}
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
                    position={position}
                    section={fundNavHistorySection}
                    onRetry={() => void onRetrySection('fund-nav-history')}
                    retrying={retrying === 'fund-nav-history'}
                  />
                ) : null}
              </>
            ) : null}
            <MarketDetailSecurityInfo position={position} />
            <MarketDetailPositionContext position={position} unit={unit} />
            {visibleDetail && visibleDetail.capabilities.unsupported.length > 0 ? (
              <details
                className="rounded-md bg-muted/20 p-3 text-sm text-muted-foreground"
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
          </div>
          {!narrow && sidebar !== 'unopened' && (
            <InstrumentReadingSidebar key={position.symbol} position={position} id={readingId} open={sidebar === 'open'} />
          )}
        </div>
        {narrow && <InstrumentReadingSheet key={position.symbol} position={position} />}
      </DialogContent>
    </Dialog>
  );
}
