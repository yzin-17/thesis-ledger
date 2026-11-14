import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { StrategyIdentityGuard } from '../backtest/strategy-identity.guard.js';
import { AiModule } from '../ai/ai.module.js';
import { BacktestModule } from '../backtest/backtest.module.js';
import { RiskModule } from '../risk/risk.module.js';
import { MarketModule } from '../market/market.module.js';
import { StrategySubmissionsController } from './strategy-submissions.controller.js';
import { StrategySubmissions } from './strategy-submissions.js';
import { StrategySubmissionExecution } from './strategy-submission-execution.js';
import { OptimizationPreparation } from './optimization-preparation.js';
import { OptimizationModelResolution } from './optimization-model-resolution.js';
import { PlatformModule } from '../platform/platform.module.js';
import { StrategyOptimizationCandidateService } from './strategy-optimization-candidate.service.js';
import { StrategyOptimizationAiSettlementStore } from './strategy-optimization-ai-settlement.store.js';
import { StrategyOptimizationSdkExecutor } from './strategy-optimization-sdk-executor.js';
import { StrategyOptimizationController } from './strategy-optimization.controller.js';
import { StrategyOptimizationPreparationController } from './strategy-optimization-preparation.controller.js';
import { StrategyOptimizationReadService } from './strategy-optimization-read.service.js';
import { StrategyOptimizationReconciler } from './strategy-optimization-reconciler.service.js';
import { StrategyOptimizationRunService } from './strategy-optimization-run.service.js';
import { StrategyOptimizationService } from './strategy-optimization.service.js';
import { StrategyRiskApplicationStoreService } from './strategy-risk-application-store.service.js';
import { StrategyRiskApplicationService } from './strategy-risk-application.service.js';

@Module({
  imports: [AiModule, BacktestModule, IdentityModule, RiskModule, PlatformModule, MarketModule],
  controllers: [StrategyOptimizationController, StrategyOptimizationPreparationController, StrategySubmissionsController],
  providers: [
    OptimizationModelResolution,
    StrategyIdentityGuard, OptimizationPreparation, StrategySubmissionExecution, StrategySubmissions,
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
