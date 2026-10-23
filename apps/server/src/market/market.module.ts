import { MarketLifecycleReaderV3 } from './market-lifecycle-reader-v3.js';
import { Module } from '@nestjs/common';
import { DsaModule } from '../integration/dsa/dsa.module.js';
import { QualityModule } from '../quality/quality.module.js';
import { InstrumentService } from './instrument.service.js';
import { CatalogSyncService } from './instruments/catalog-sync.service.js';
import { InstrumentAssociationService } from './instruments/instrument-association.service.js';
import { InstrumentDirectoryService } from './instruments/instrument-directory.service.js';
import { InstrumentSearchService } from './instruments/instrument-search.service.js';
import { CatalogReadinessService } from './catalog-readiness.service.js';
import { MarketControlService } from './market-control.service.js';
import { MarketRouteRevisionService } from './market-route-revision.service.js';
import { MarketDataController } from './market-data.controller.js';
import { MarketSecurityLotSizeController } from './market-security-lot-size.controller.js';
import { MarketSecurityStaticInfoController } from './market-security-static-info.controller.js';
import { MarketAnnouncementsController } from './market-announcements.controller.js';
import { MarketAnnouncementPreparationService } from './market-announcement-preparation.service.js';
import { MarketDetailService } from './market-detail.service.js';
import { MarketService } from './market.service.js';
import { MarketBarWindowReaderV3 } from './market-bar-reader-v3.js';
import { MarketWindowEvidenceV3Repository } from './market-window-evidence-v3.repository.js';
import { MarketDerivedSeriesRepository } from './market-derived-series.repository.js';
import { MarketFrozenWindowReaderV3 } from './market-frozen-window-reader-v3.js';
import { MarketChartReaderV3 } from './market-chart-reader-v3.js';
import { MarketChartProofRepository } from './market-chart-proof.repository.js';
import { MarketPitReconstructionRepository } from './market-pit-reconstruction.repository.js';
import { MarketBarReader } from './market-bar-reader.js';
import { MarketController } from './market.controller.js';
import { MarketNavReaderV3 } from './market-nav-reader-v3.js';
import { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import { MarketPeriodReader } from './market-period-reader.js';
import { MarketPeriodViewCache } from './market-period-view-cache.js';
import { MarketPeriodIndicatorReader } from './market-period-indicator-reader.js';
import { MarketPeriodDisplayService } from './market-period-display.service.js';
import { MarketPeriodDetailService } from './market-period-detail.service.js';
import { MarketPeriodOptionsService } from './market-period-options.service.js';
import { MarketNewsReader } from './market-news-reader.js';
import { MarketNewsFeedReader } from './market-news-feed-reader.js';
import { MarketNewsController } from './market-news.controller.js';
import { MarketReportMetadataController } from './market-report-metadata.controller.js';
import { MarketReportMetadataService } from './market-report-metadata.service.js';
import { MarketReportMetadataRepository } from './market-report-metadata.repository.js';

@Module({
  imports: [QualityModule, DsaModule],
  controllers: [
    MarketDataController,
    MarketController,
    MarketAnnouncementsController,
    MarketSecurityLotSizeController,
    MarketSecurityStaticInfoController,
    MarketNewsController,
    MarketReportMetadataController,
  ],
  providers: [
    MarketReportMetadataService,
    MarketReportMetadataRepository,
    MarketNewsReader,
    MarketNewsFeedReader,
    MarketLifecycleReaderV3,
    MarketAnnouncementPreparationService,
    MarketPeriodCalendarReader,
    MarketPeriodReader,
    MarketPeriodViewCache,
    MarketPeriodIndicatorReader,
    MarketPeriodDisplayService,
    MarketPeriodDetailService,
    MarketPeriodOptionsService,
    MarketNavReaderV3,
    MarketService,
    MarketDetailService,
    CatalogSyncService,
    CatalogReadinessService,
    InstrumentSearchService,
    InstrumentAssociationService,
    InstrumentDirectoryService,
    InstrumentService,
    MarketControlService,
    MarketRouteRevisionService,
    MarketWindowEvidenceV3Repository,
    MarketDerivedSeriesRepository,
    MarketFrozenWindowReaderV3,
    MarketBarWindowReaderV3,
    MarketChartReaderV3,
    MarketChartProofRepository,
    MarketPitReconstructionRepository,
    MarketBarReader,
  ],
  exports: [
    MarketPeriodCalendarReader,
    MarketNewsReader,
    MarketLifecycleReaderV3,
    MarketAnnouncementPreparationService,
    MarketNavReaderV3,
    MarketPitReconstructionRepository,
    MarketRouteRevisionService,
    MarketService,
    MarketDetailService,
    InstrumentService,
    CatalogSyncService,
    InstrumentSearchService,
    InstrumentAssociationService,
    InstrumentDirectoryService,
    MarketControlService,
    MarketBarReader,
  ],
})
export class MarketModule {}
