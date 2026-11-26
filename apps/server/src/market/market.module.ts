import { MarketBacktestInputModule } from './market-backtest-input.module.js';
import { MarketObservationsService } from './market-observations.service.js';
import { MarketBackgroundQuotesService } from './market-background-quotes.service.js';
import { MarketBackgroundBarReader } from './market-background-bar-reader.js';
import {MarketActionCoverage} from './market-action-coverage.js';
import {MarketOpenEvidence} from './market-open-evidence.js';
import { MarketLiveExecutionReader } from './market-live-execution-reader.js';
import { MarketArenaValuationReader } from './market-arena-valuation-reader.js';
import { MarketNativeIndicatorReader } from './market-native-indicator-reader.js';
import { MarketResearchSeriesReader } from './market-research-series-reader.js';
import {MarketInstrumentEvidence} from './market-instrument-evidence.js';
import { Module } from '@nestjs/common';
import { DsaModule } from '../integration/dsa/dsa.module.js';
import { QualityModule } from '../quality/quality.module.js';
import { InstrumentService } from './instrument.service.js';
import { CatalogSyncService } from './instruments/catalog-sync.service.js';
import { InstrumentAssociationService } from './instruments/instrument-association.service.js';
import { InstrumentDirectoryService } from './instruments/instrument-directory.service.js';
import { InstrumentDisplayService } from './instruments/instrument-display.service.js';
import { InstrumentSearchService } from './instruments/instrument-search.service.js';
import { CatalogReadinessService } from './catalog-readiness.service.js';
import { MarketRoutingConfigService } from './market-routing-config.service.js';
import { MarketRoutingConfigController } from './market-routing-config.controller.js';
import { MarketDataController } from './market-data.controller.js';
import { MarketRuleMonitorController } from './market-rule-monitor.controller.js';
import { MarketRuleMonitorReader } from './market-rule-monitor-reader.js';
import { MarketSecurityLotSizeController } from './market-security-lot-size.controller.js';
import { MarketSecurityStaticInfoController } from './market-security-static-info.controller.js';
import { MarketAnnouncementsController } from './market-announcements.controller.js';
import { MarketDetailService } from './market-detail.service.js';
import { MarketService } from './market.service.js';
import { MarketDerivedSeriesRepository } from './market-derived-series.repository.js';
import { MarketController } from './market.controller.js';
import { MarketQuotesController } from './market-quotes.controller.js';
import { MarketNavReaderV3 } from './market-nav-reader-v3.js';
import { MarketArenaReplayReader } from './market-arena-replay-reader.js';
import { MarketArenaHistorySource } from './market-arena-history-source.js';
import { MarketPeriodReader } from './market-period-reader.js';
import { MarketPeriodViewCache } from './market-period-view-cache.js';
import { MarketPeriodIndicatorReader } from './market-period-indicator-reader.js';
import { MarketPeriodDisplayService } from './market-period-display.service.js';
import { MarketPeriodDetailService } from './market-period-detail.service.js';
import { MarketPeriodOptionsService } from './market-period-options.service.js';
import { MarketMinuteDisplayService } from './market-minute-display.service.js';
import { MarketMinuteOptionsService } from './market-minute-options.service.js';
import { MarketNewsReader } from './market-news-reader.js';
import { MarketNewsFeedReader } from './market-news-feed-reader.js';
import { MarketNewsController } from './market-news.controller.js';
import { MarketReportMetadataController } from './market-report-metadata.controller.js';
import { MarketReportMetadataService } from './market-report-metadata.service.js';
import { MarketReportMetadataRepository } from './market-report-metadata.repository.js';
import { MarketReferenceController } from './market-reference.controller.js';
import { MarketFundValuationController } from './market-fund-valuation.controller.js';
import { MarketFundValuationService } from './market-fund-valuation.service.js';
import { FundDailyErrorService } from './fund-daily-error.service.js';
import { FundValuationPointRepository } from './fund-valuation-point.repository.js';

@Module({
  imports: [QualityModule, DsaModule, MarketBacktestInputModule],
  controllers: [
    MarketRoutingConfigController,
    MarketFundValuationController,
    MarketReferenceController,
    MarketDataController,
    MarketRuleMonitorController,
    MarketController,
    MarketQuotesController,
    MarketAnnouncementsController,
    MarketSecurityLotSizeController,
    MarketSecurityStaticInfoController,
    MarketNewsController,
    MarketReportMetadataController,
  ],
  providers: [
    MarketRoutingConfigService,
    MarketRuleMonitorReader,
    MarketBackgroundQuotesService,
    MarketBackgroundBarReader,
    MarketObservationsService,
    MarketActionCoverage,
    MarketOpenEvidence,
    MarketLiveExecutionReader,
    MarketArenaValuationReader,
    MarketNativeIndicatorReader,
    MarketResearchSeriesReader,
    MarketInstrumentEvidence,
    MarketFundValuationService,
    FundValuationPointRepository,
    FundDailyErrorService,
    MarketReportMetadataService,
    MarketReportMetadataRepository,
    MarketNewsReader,
    MarketNewsFeedReader,
    MarketArenaReplayReader,
    MarketArenaHistorySource,
    MarketPeriodReader,
    MarketPeriodViewCache,
    MarketPeriodIndicatorReader,
    MarketPeriodDisplayService,
    MarketPeriodDetailService,
    MarketPeriodOptionsService,
    MarketMinuteDisplayService,
    MarketMinuteOptionsService,
    MarketNavReaderV3,
    MarketService,
    MarketDetailService,
    CatalogSyncService,
    CatalogReadinessService,
    InstrumentSearchService,
    InstrumentAssociationService,
    InstrumentDirectoryService,
    InstrumentDisplayService,
    InstrumentService,
    MarketDerivedSeriesRepository,
  ],
  exports: [
    MarketBacktestInputModule,
    MarketBackgroundBarReader,
    MarketArenaReplayReader,
    MarketArenaValuationReader,
    MarketResearchSeriesReader,
    MarketLiveExecutionReader,
    MarketRuleMonitorReader,
    MarketBackgroundQuotesService,
    MarketObservationsService,
    MarketOpenEvidence,
    MarketInstrumentEvidence,
    MarketFundValuationService,
    MarketNewsReader,
    MarketNavReaderV3,
    MarketService,
    MarketDetailService,
    InstrumentService,
    CatalogSyncService,
    InstrumentSearchService,
    InstrumentAssociationService,
    InstrumentDirectoryService,
    InstrumentDisplayService,
  ],
})
export class MarketModule {}
