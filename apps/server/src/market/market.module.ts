import { Module } from '@nestjs/common';
import { QualityModule } from '../quality/quality.module.js';
import { DsaClient } from './dsa-client.js';
import { InstrumentService } from './instrument.service.js';
import { CatalogSyncService } from './instruments/catalog-sync.service.js';
import { InstrumentAssociationService } from './instruments/instrument-association.service.js';
import { InstrumentSearchService } from './instruments/instrument-search.service.js';
import { MarketControlService } from './market-control.service.js';
import { MarketDataController } from './market-data.controller.js';
import { MarketStorageService } from './market-storage.service.js';
import { MarketController } from './market.controller.js';
import { MarketService } from './market.service.js';
import { MarketDetailService } from './market-detail.service.js';

@Module({
  imports: [QualityModule],
  controllers: [MarketController, MarketDataController],
  providers: [
    DsaClient,
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
    DsaClient,
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
