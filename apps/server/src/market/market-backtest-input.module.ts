import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module.js';
import { DsaModule } from '../integration/dsa/dsa.module.js';
import { QualityModule } from '../quality/quality.module.js';
import { MarketControlService } from './market-control.service.js';
import { MarketRouteRevisionService } from './market-route-revision.service.js';
import { MarketWindowEvidenceV3Repository } from './market-window-evidence-v3.repository.js';
import { MarketFrozenWindowReaderV3 } from './market-frozen-window-reader-v3.js';
import { MarketBarWindowReaderV3 } from './market-bar-reader-v3.js';
import { MarketChartReaderV3 } from './market-chart-reader-v3.js';
import { MarketChartResultCache } from './market-chart-result-cache.js';
import { MarketChartProofRepository } from './market-chart-proof.repository.js';
import { MarketPitReconstructionRepository } from './market-pit-reconstruction.repository.js';
import { MarketBarReader } from './market-bar-reader.js';
import { MarketEventFreeReader } from './market-event-free-reader.js';
import { MarketEventFreeRepository } from './market-event-free.repository.js';
import { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import { MarketSessionReader } from './market-session-reader.js';
import { MarketLifecycleReaderV3 } from './market-lifecycle-reader-v3.js';
import { MarketAnnouncementPreparationService } from './market-announcement-preparation.service.js';

const readers = [MarketControlService, MarketRouteRevisionService, MarketWindowEvidenceV3Repository,
  MarketFrozenWindowReaderV3, MarketBarWindowReaderV3, MarketChartReaderV3, MarketChartResultCache,
  MarketChartProofRepository, MarketPitReconstructionRepository, MarketBarReader, MarketEventFreeReader,
  MarketEventFreeRepository, MarketPeriodCalendarReader, MarketSessionReader, MarketLifecycleReaderV3,
  MarketAnnouncementPreparationService];

/** 回测输入组件的装配边界，不包含行情后台维护生命周期。 */
@Module({ imports: [PlatformModule, DsaModule, QualityModule], providers: readers, exports: readers })
export class MarketBacktestInputModule {}
