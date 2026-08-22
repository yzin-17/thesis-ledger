import { Module } from '@nestjs/common';
import { DsaModule } from '../integration/dsa/dsa.module.js';
import { QualityModule } from '../quality/quality.module.js';
import { InstrumentService } from './instrument.service.js';
import { CatalogSyncService } from './instruments/catalog-sync.service.js';
import { InstrumentAssociationService } from './instruments/instrument-association.service.js';
import { InstrumentSearchService } from './instruments/instrument-search.service.js';
import { MarketControlService } from './market-control.service.js';
import { MarketDataController } from './market-data.controller.js';
import { MarketStorageService } from './market-storage.service.js';
import { MarketController } from './market.controller.js';
import { MarketDetailService } from './market-detail.service.js';
import { MarketService } from './market.service.js';

@Module({
  imports: [QualityModule, DsaModule],
  controllers: [MarketController, MarketDataController],
  providers: [
    MarketService,
    MarketDetailService,
    MarketStorageService,
    CatalogSyncService,
    InstrumentSearchService,
    InstrumentAssociationService,
    InstrumentService,
    MarketControlService,
  ],
  exports: [
    MarketService,
    MarketDetailService,
    MarketStorageService,
    InstrumentService,
    CatalogSyncService,
    InstrumentSearchService,
    InstrumentAssociationService,
    MarketControlService,
  ],
})
export class MarketModule {}
