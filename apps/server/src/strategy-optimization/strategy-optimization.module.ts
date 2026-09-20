import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { BacktestModule } from '../backtest/backtest.module.js';
import { RiskModule } from '../risk/risk.module.js';
import { PlatformModule } from '../platform/platform.module.js';
import { StrategyOptimizationCandidateService } from './strategy-optimization-candidate.service.js';
import { StrategyOptimizationAiSettlementStore } from './strategy-optimization-ai-settlement.store.js';
import { StrategyOptimizationSdkExecutor } from './strategy-optimization-sdk-executor.js';
import { StrategyOptimizationController } from './strategy-optimization.controller.js';
import { StrategyOptimizationReadService } from './strategy-optimization-read.service.js';
import { StrategyOptimizationReconciler } from './strategy-optimization-reconciler.service.js';
import { StrategyOptimizationRunService } from './strategy-optimization-run.service.js';
import { StrategyOptimizationService } from './strategy-optimization.service.js';
import { StrategyRiskApplicationStoreService } from './strategy-risk-application-store.service.js';
import { StrategyRiskApplicationService } from './strategy-risk-application.service.js';

@Module({
  imports: [AiModule, BacktestModule, RiskModule, PlatformModule],
  controllers: [StrategyOptimizationController],
  providers: [
    StrategyOptimizationReadService,
    StrategyOptimizationRunService,
    StrategyOptimizationSdkExecutor,
    StrategyOptimizationCandidateService,
    StrategyOptimizationAiSettlementStore,
    StrategyRiskApplicationStoreService,
    StrategyRiskApplicationService,
    StrategyOptimizationService,
    StrategyOptimizationReconciler,
  ],
  exports: [StrategyOptimizationService, StrategyRiskApplicationService],
})
export class StrategyOptimizationModule {}
