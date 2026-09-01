import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { PerformanceController } from './performance.controller.js';
import { PerformanceService } from './performance.service.js';

@Module({
  imports: [MarketModule, PortfolioModule],
  controllers: [PerformanceController],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
