import { Module } from '@nestjs/common';
import { QualityModule } from '../quality/quality.module.js';
import { DsaClient } from './dsa-client.js';
import { InstrumentService } from './instrument.service.js';
import { MarketControlService } from './market-control.service.js';
import { MarketDataController } from './market-data.controller.js';
import { MarketStorageService } from './market-storage.service.js';
import { MarketController } from './market.controller.js';
import { MarketService } from './market.service.js';

@Module({
  imports: [QualityModule],
  controllers: [MarketController, MarketDataController],
  providers: [DsaClient, MarketService, MarketStorageService, InstrumentService, MarketControlService],
  exports: [DsaClient, MarketService, MarketStorageService, InstrumentService, MarketControlService],
})
export class MarketModule {}
