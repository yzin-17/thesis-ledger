import { Module } from '@nestjs/common';
import { DsaModule } from '../integration/dsa/dsa.module.js';
import { QualityModule } from '../quality/quality.module.js';
import { InstrumentService } from './instrument.service.js';
import { CatalogSyncService } from './instruments/catalog-sync.service.js';
import { InstrumentAssociationService } from './instruments/instrument-association.service.js';
import { InstrumentSearchService } from './instruments/instrument-search.service.js';
import { CatalogReadinessService } from './catalog-readiness.service.js';
import { MarketControlService } from './market-control.service.js';
import { MarketDataController } from './market-data.controller.js';
import { MarketDetailService } from './market-detail.service.js';
import { MarketService } from './market.service.js';
import { BacktestBarAggregationService } from './backtest-bar-aggregation.service.js';
import {
  DsaMarketBarPolicyPort,
  DsaMarketBarRemotePort,
  MarketBarReader,
  PrismaMarketBarFactStore,
} from './market-bar-reader.js';
import { MarketV2Controller } from './market-v2.controller.js';

@Module({
  imports: [QualityModule, DsaModule],
  controllers: [MarketDataController, MarketV2Controller],
  providers: [
    MarketService,
    MarketDetailService,
    CatalogSyncService,
    CatalogReadinessService,
    InstrumentSearchService,
    InstrumentAssociationService,
    InstrumentService,
    MarketControlService,
    BacktestBarAggregationService,
    DsaMarketBarPolicyPort,
    DsaMarketBarRemotePort,
    PrismaMarketBarFactStore,
    MarketBarReader,
  ],
  exports: [
    MarketService,
    MarketDetailService,
    InstrumentService,
    CatalogSyncService,
    InstrumentSearchService,
    InstrumentAssociationService,
    MarketControlService,
    BacktestBarAggregationService,
    MarketBarReader,
  ],
})
export class MarketModule {}
