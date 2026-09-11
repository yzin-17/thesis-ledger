import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { BacktestModule } from '../backtest/backtest.module.js';
import { StrategyOptimizationCandidateService } from './strategy-optimization-candidate.service.js';
import { StrategyOptimizationController } from './strategy-optimization.controller.js';
import { StrategyOptimizationReadService } from './strategy-optimization-read.service.js';
import { StrategyOptimizationRunService } from './strategy-optimization-run.service.js';
import { StrategyOptimizationService } from './strategy-optimization.service.js';
import { StrategyRiskApplicationService } from './strategy-risk-application.service.js';

@Module({
  imports: [AiModule, BacktestModule],
  controllers: [StrategyOptimizationController],
  providers: [
    StrategyOptimizationReadService,
    StrategyOptimizationRunService,
    StrategyOptimizationCandidateService,
    StrategyOptimizationService,
    StrategyRiskApplicationService,
  ],
  exports: [StrategyOptimizationService, StrategyRiskApplicationService],
})
export class StrategyOptimizationModule {}
