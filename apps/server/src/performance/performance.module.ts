import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { PerformanceAnalysisService } from './performance-analysis.service.js';
import { PerformanceController } from './performance.controller.js';
import { PerformanceDataService } from './performance-data.service.js';
import { PerformanceLayerService } from './performance-layer.service.js';
import { PerformanceService } from './performance.service.js';
import { PerformanceSnapshotService } from './performance-snapshot.service.js';
import { PerformanceTargetService } from './performance-target.service.js';

@Module({
  imports: [MarketModule, PortfolioModule],
  controllers: [PerformanceController],
  providers: [
    PerformanceDataService,
    PerformanceSnapshotService,
    PerformanceLayerService,
    PerformanceAnalysisService,
    PerformanceTargetService,
    PerformanceService,
  ],
  exports: [PerformanceService],
})
export class PerformanceModule {}
