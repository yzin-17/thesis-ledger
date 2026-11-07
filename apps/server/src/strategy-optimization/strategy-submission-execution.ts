import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  backtestNavPreparationResultV3Schema,
  backtestRunPreparationResultV3Schema,
  optimizationRunPreparationResultSchema,
  type StrategySubmissionInput,
} from '@thesis-ledger/schemas';
import { StrategyAccessService } from '../backtest/strategy-access.service.js';
import { BacktestRunPreparationService } from '../backtest/backtest-run-preparation.service.js';
import { BacktestNavPreparationService } from '../backtest/backtest-nav-preparation.service.js';
import { BacktestNavRunService } from '../backtest/backtest-nav-run.service.js';
import { BacktestService } from '../backtest/backtest.service.js';
import { MarketRouteRevisionService } from '../market/market-route-revision.service.js';
import { AiProviderRegistry } from '../ai/provider-registry.js';
import { buildOptimizationModelConfig } from './strategy-optimization-model-routing.js';
import { OptimizationPreparation } from './optimization-preparation.js';
import { StrategyOptimizationService } from './strategy-optimization.service.js';
import { StrategyOptimizationReadService } from './strategy-optimization-read.service.js';

@Injectable()
export class StrategySubmissionExecution {
  constructor(
    @Inject(StrategyAccessService) private readonly access: StrategyAccessService,
    @Inject(BacktestRunPreparationService) private readonly ordinary: BacktestRunPreparationService,
    @Inject(BacktestNavPreparationService) private readonly nav: BacktestNavPreparationService,
    @Inject(OptimizationPreparation) private readonly optimization: OptimizationPreparation,
    @Inject(BacktestService) private readonly runs: BacktestService,
    @Inject(BacktestNavRunService) private readonly navRuns: BacktestNavRunService,
    @Inject(StrategyOptimizationService) private readonly experiments: StrategyOptimizationService,
    @Inject(StrategyOptimizationReadService)
    private readonly settings: StrategyOptimizationReadService,
    @Inject(AiProviderRegistry) private readonly providers: AiProviderRegistry,
    @Inject(MarketRouteRevisionService) private readonly revisions: MarketRouteRevisionService,
  ) {}

  async authorize(ownerId: string, input: StrategySubmissionInput) {
    if (input.kind !== 'optimization')
      return this.access.version(input.preparation.strategyVersionId, ownerId);
    const { target } = input.preparation;
    if (target.sourceMode === 'existing')
      await this.access.version(target.strategyVersionId, ownerId);
  }
  private checkModels(input: Extract<StrategySubmissionInput, { kind: 'optimization' }>) {
    const caps = this.settings.capabilities();
    if (!caps.aiOptimizationEnabled) throw new BadRequestException('AI 优化当前未启用');
    const configs = buildOptimizationModelConfig(
      input.settings.models,
      this.providers,
      input.preparation.target.sourceMode === 'existing'
        ? 'parameter_optimization'
        : 'strategy_discovery',
    );
    if (
      configs.some(
        (m) => m.costStatus !== 'known' || m.costPer1kInput !== 0 || m.costPer1kOutput !== 0,
      )
    )
      throw new BadRequestException('自动创建实验只接受输入和输出均登记为零价的模型');
    for (const selected of input.settings.models) {
      const route = caps.providers.find(
        (r) => r.provider === selected.provider && r.model === selected.model,
      );
      if (!route || (route.costStatus === 'unknown' && !input.settings.acknowledgeUnknownCost))
        throw new BadRequestException('模型不可用或未知费用尚未确认');
    }
  }
  async prepare(input: StrategySubmissionInput) {
    if (input.kind === 'ordinary') return this.ordinary.prepare(input.preparation);
    if (input.kind === 'nav') return this.nav.prepare(input.preparation);
    this.checkModels(input);
    return this.optimization.prepare(input.preparation);
  }
  requiresConfirmation(
    input: StrategySubmissionInput,
    value: Awaited<ReturnType<StrategySubmissionExecution['prepare']>>,
  ) {
    if (input.kind === 'nav') return true;
    if (value.status !== 'prepared' || !('actualSource' in value)) return true;
    if (
      !('provenance' in value.actualSource) ||
      value.actualSource.provenance.routeIndex !== 0 ||
      ('announcementPreparation' in value && value.announcementPreparation?.errors.length)
    )
      return true;
    if (input.kind === 'optimization')
      return (
        input.settings.acknowledgeUnknownCost &&
        this.settings
          .capabilities()
          .providers.some(
            (route) =>
              route.costStatus === 'unknown' &&
              input.settings.models.some(
                (m) => m.model === route.model && m.provider === route.provider,
              ),
          )
      );
    return Boolean(
      input.preparation.knownCashResearch ||
      input.preparation.cashEventResearch ||
      input.preparation.lifecycleResearch ||
      input.preparation.marketRuleResearch,
    );
  }
  async create(id: string, input: StrategySubmissionInput, prepared: unknown) {
    const idempotencyKey = 'strategy-submit:' + id;
    if (input.kind === 'ordinary') {
      const p = backtestRunPreparationResultV3Schema.parse(prepared);
      if (p.status !== 'prepared' || p.executionPreflight.status !== 'ready')
        throw new Error('缺少有效回测预检');
      return this.runs.createRun({
        contractVersion: 3,
        strategyVersionId: input.preparation.strategyVersionId,
        runConfig: p.runConfig,
        preparationStamp: p.executionPreflight.revisionStamp,
        idempotencyKey,
      });
    }
    if (input.kind === 'nav') {
      const p = backtestNavPreparationResultV3Schema.parse(prepared);
      if (p.status !== 'prepared' || !p.receipt) throw new Error('缺少有效净值准备凭证');
      return this.navRuns.create({
        contractVersion: 3,
        preparationId: p.receipt.preparationId,
        preparationHash: p.receipt.preparationHash,
        idempotencyKey,
      });
    }
    this.checkModels(input);
    const p = optimizationRunPreparationResultSchema.parse(prepared);
    if (p.status !== 'prepared' || p.actualSource.routeKey.kind !== 'bar')
      throw new Error('缺少有效实验预检');
    const current = await this.revisions.readCurrent(p.actualSource.routeKey);
    if (
      current.desiredRevision !== p.routeRevisions.desiredRevision ||
      current.effectiveRevision !== p.routeRevisions.effectiveRevision ||
      current.catalogRevision !== p.routeRevisions.catalogRevision
    )
      throw new Error('行情路由已变化，请重新准备实验');
    return this.experiments.create({
      ...input.settings,
      budget: { ...input.settings.budget, maxCost: '0' },
      ...input.preparation.target,
      contractVersion: 3,
      runConfig: p.runConfig,
      idempotencyKey,
    });
  }
}
