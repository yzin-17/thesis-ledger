import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { runConfigSchemaV3 } from '@thesis-ledger/schemas';
import { evaluateOptimizationResult, invalidOptimizationComparison } from './strategy-optimization-evaluation.js';
export { calculateOptimizationScore } from './strategy-optimization-evaluation.js';
import { BacktestService } from '../backtest/backtest.service.js';
import { assertCurrentRunForRead } from '../backtest/backtest-current-run-read.js';
import { requireOptimizationPriceResearch, RESEARCH_STRATEGY_SPACE_VERSION } from './strategy-optimization-research.js';
import { BacktestConfiguredRunService } from '../backtest/backtest-configured-run.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import {
  optimizationRemainingDurationMs,
  optimizationDataArtifactFingerprint,
  toRecord,
  type EvaluationSummary,
  type ExperimentRow,
  type SplitName,
} from './strategy-optimization-common.js';
import {
  isKnownCostAmount,
  normalizeCostCurrency,
  optimizationCostError,
} from './strategy-optimization-cost.js';

type BacktestJob = NonNullable<Awaited<ReturnType<BacktestService['status']>>>;

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

@Injectable()
export class StrategyOptimizationRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backtests: BacktestService,
    @Optional()
    @Inject(BacktestConfiguredRunService)
    private readonly configuredRuns?: BacktestConfiguredRunService,
  ) {}

  async assertFrozenResearchBudget(experiment: ExperimentRow) {
    if (!this.configuredRuns) throw new BadRequestException('配置预检服务未就绪');
    const config = runConfigSchemaV3.parse(experiment.runConfig);
    if (config.priceResearch) requireOptimizationPriceResearch(config, {
      legacy: !config.priceResearch.dataScope && experiment.strategySpaceVersion !== RESEARCH_STRATEGY_SPACE_VERSION,
      strategySpaceVersion: experiment.strategySpaceVersion,
    });
    await this.configuredRuns.assertFrozenResearchBudget(experiment.baselineStrategyVersionId, experiment.runConfig);
  }

  async reserveBudget(
    id: string,
    input: {
      aiCalls?: number;
      backtestRuns?: number;
      inputTokens?: number;
      outputTokens?: number;
      estimatedCost?: number;
      executionAttempt?: number;
    },
    transaction?: Prisma.TransactionClient,
  ) {
    const database = transaction ?? this.prisma;
    const aiCalls = input.aiCalls ?? 0;
    const runs = input.backtestRuns ?? 0;
    const inputTokens = input.inputTokens ?? 0;
    const outputTokens = input.outputTokens ?? 0;
    const estimatedCost = input.estimatedCost ?? 0;
    const executionAttempt = input.executionAttempt ?? null;
    const updated = await database.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "aiCallsUsed"="aiCallsUsed"+${aiCalls}, "backtestRunsUsed"="backtestRunsUsed"+${runs},
          "inputTokensUsed"="inputTokensUsed"+${inputTokens},
          "outputTokensUsed"="outputTokensUsed"+${outputTokens},
          "costUsed"="costUsed"+${estimatedCost}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "cancelRequestedAt" IS NULL
        AND (${executionAttempt}::int IS NULL OR
          ("executionAttempt"=${executionAttempt} AND "status" IN ('running','testing')))
        AND (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "createdAt")) * 1000 - "pausedDurationMs")
          <= COALESCE(NULLIF("budget"->>'maxDurationSeconds', '')::int, 1800) * 1000
        AND ((("budget"->>'maxAiCalls')::int) = 0 OR "aiCallsUsed"+${aiCalls} <= (("budget"->>'maxAiCalls')::int))
        AND ((("budget"->>'maxBacktestRuns')::int) = 0 OR "backtestRunsUsed"+${runs} <= (("budget"->>'maxBacktestRuns')::int))
        AND ((("budget"->>'maxInputTokens')::int) = 0 OR "inputTokensUsed"+${inputTokens} <= (("budget"->>'maxInputTokens')::int))
        AND ((("budget"->>'maxOutputTokens')::int) = 0 OR "outputTokensUsed"+${outputTokens} <= (("budget"->>'maxOutputTokens')::int))
        AND (("budget"->>'maxCost') IS NULL OR "costUsed"+${estimatedCost} <= (("budget"->>'maxCost')::decimal))
    `);
    if (updated !== 1)
      throw new BadRequestException('优化实验预算或最长运行时长已耗尽，或实验已取消');
  }

  outputTokenReservation(experiment: ExperimentRow) {
    const budget = toRecord(experiment.budget);
    const maxOutputTokens =
      typeof budget.maxOutputTokens === 'number' ? budget.maxOutputTokens : 20_000;
    // 不限累计输出时仍保留账务预估；SDK 沿用 Provider 单次输出配置。
    if (maxOutputTokens === 0) return 20_000;
    let maxAiCalls = typeof budget.maxAiCalls === 'number' ? budget.maxAiCalls : 1;
    if (maxAiCalls === 0) {
      const modelCount = Array.isArray(experiment.modelConfig) ? experiment.modelConfig.length : 1;
      maxAiCalls = Math.max(1, modelCount) * Math.max(1, experiment.maxRounds ?? 1);
    }
    return Math.max(1, Math.floor(maxOutputTokens / Math.max(1, maxAiCalls)));
  }

  async reconcileTokenUsage(
    id: string,
    reservedInput: number,
    reservedOutput: number,
    actualInput: number,
    actualOutput: number,
    transaction?: Prisma.TransactionClient,
  ) {
    const database = transaction ?? this.prisma;
    const inputDelta = actualInput - reservedInput;
    const outputDelta = actualOutput - reservedOutput;
    const rows = await database.$queryRaw<
      Array<{ inputTokensUsed: number; outputTokensUsed: number; budget: unknown }>
    >(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "inputTokensUsed"="inputTokensUsed"+${inputDelta},
          "outputTokensUsed"="outputTokensUsed"+${outputDelta},
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid
      RETURNING "inputTokensUsed", "outputTokensUsed", "budget"
    `);
    const row = rows[0];
    if (!row) return;
    const budget = toRecord(row.budget);
    const maxInput = typeof budget.maxInputTokens === 'number' ? budget.maxInputTokens : 0;
    const maxOutput = typeof budget.maxOutputTokens === 'number' ? budget.maxOutputTokens : 0;
    if ((budget.maxInputTokens !== 0 && row.inputTokensUsed > maxInput) || (budget.maxOutputTokens !== 0 && row.outputTokensUsed > maxOutput))
      throw new BadRequestException('Provider 实际 token 用量超过预留预算，已停止新任务');
  }

  async reconcileCost(
    id: string,
    estimated: number,
    actual: number,
    transaction?: Prisma.TransactionClient,
    actualCostKnown = true,
    actualCurrency: string | null = null,
  ) {
    const database = transaction ?? this.prisma;
    const delta = actual - estimated;
    const rows = await database.$queryRaw<
      Array<{ costUsed: Prisma.Decimal; budget: unknown; modelConfig: unknown }>
    >(Prisma.sql`
      SELECT "costUsed", "budget", "modelConfig"
      FROM "OptimizationExperiment" WHERE "id"=${id}::uuid LIMIT 1
    `);
    const row = rows[0];
    if (!row) return;
    const maxCost = toRecord(row.budget).maxCost;
    if (!actualCostKnown || !normalizeCostCurrency(actualCurrency) || !isKnownCostAmount(actual)) {
      if (typeof maxCost === 'string')
        throw optimizationCostError(
          'OPTIMIZATION_COST_TOTAL_LIMIT_UNAVAILABLE',
          'Provider 未返回可确认的费用币种，不能继续使用实验总金额上限',
        );
      return;
    }
    const knownCurrencies = [
      ...new Set(
        (Array.isArray(row.modelConfig) ? row.modelConfig : [])
          .map((item) => toRecord(item))
          .map((item) => normalizeCostCurrency(item.costCurrency))
          .filter((currency): currency is string => currency !== null),
      ),
    ];
    if (knownCurrencies.length > 1)
      throw optimizationCostError(
        'OPTIMIZATION_COST_MIXED_CURRENCY',
        '同一实验不能混用已知的不同计费币种',
        { currencies: knownCurrencies },
      );
    if (
      knownCurrencies.length === 1 &&
      knownCurrencies[0] !== normalizeCostCurrency(actualCurrency)
    )
      throw optimizationCostError(
        'OPTIMIZATION_COST_CURRENCY_MISMATCH',
        'Provider 返回的费用币种与实验冻结币种不一致',
        { expected: knownCurrencies[0], actual: normalizeCostCurrency(actualCurrency) },
      );
    const updated = await database.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment" SET "costUsed"="costUsed"+${delta}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid
        AND ("budget"->>'maxCost' IS NULL OR "costUsed"+${delta} <= ("budget"->>'maxCost')::decimal)
    `);
    if (updated !== 1 && typeof maxCost === 'string')
      throw new BadRequestException('优化实验实际模型费用超过预算，已停止新任务');
  }

  private splitRangeFor(experiment: ExperimentRow, splitName: SplitName) {
    const split = toRecord(experiment.split)[splitName] as
      { start?: string; end?: string } | undefined;
    if (!split?.start || !split.end) throw new Error(`实验缺少 ${splitName} 数据切分`);
    return { start: split.start, end: split.end };
  }

  private runConfigForSplit(experiment: ExperimentRow, splitName: SplitName) {
    const base = runConfigSchemaV3.parse(experiment.runConfig);
    const split = this.splitRangeFor(experiment, splitName);
    return { ...base, startDate: split.start, endDate: split.end };
  }

  private async touchLease(id: string) {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment" SET "leaseUntil"=${new Date(Date.now() + 600_000)}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "cancelRequestedAt" IS NULL
    `);
  }

  requestTimeoutMs(experiment: ExperimentRow, ceilingMs: number) {
    const remaining = optimizationRemainingDurationMs(experiment);
    if (remaining <= 0) throw new BadRequestException('优化实验最长运行时长已耗尽');
    return Math.max(1, Math.min(ceilingMs, remaining));
  }

  private async waitForRun(id: string, timeoutMs = 180_000): Promise<BacktestJob> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const job = await this.backtests.status(id);
      if (job && ['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
      await sleep(200);
    }
    throw new Error(`回测 Run 等待超时: ${id}`);
  }

  async executeRun(
    experiment: ExperimentRow,
    strategyVersionId: string,
    splitName: SplitName,
    identity: string,
  ): Promise<BacktestJob> {
    await this.touchLease(experiment.id);
    const runConfig = this.runConfigForSplit(experiment, splitName);
    const idempotencyKey = `optimization:${experiment.id}:${identity}:${splitName}`;
    let run: Awaited<ReturnType<BacktestService['createRun']>> | null;
    if (!this.configuredRuns) throw new BadRequestException('配置预检服务未就绪');
    const resolved = await this.configuredRuns.resolve(
      strategyVersionId,
      runConfig,
      idempotencyKey,
      { rebindStrategyInputs: true },
    );
    if (resolved.kind === 'existing') run = resolved.job;
    else {
      await this.reserveBudget(experiment.id, { backtestRuns: 1, executionAttempt: experiment.executionAttempt });
      run = await this.backtests.createRun(resolved.input);
    }
    if (!run) throw new Error('Run 创建后未找到持久化记录');
    if (run.status === 'failed' && run.errorCode === 'INTERNAL_ERROR') {
      run = await this.backtests.retryRun(run.id);
      if (!run) throw new Error('Run retry 后未找到持久化记录');
    }
    if (run.status === 'queued') await this.backtests.runCurrentRunForRead(run.id);
    const terminal = ['succeeded', 'failed', 'cancelled'].includes(run.status)
      ? run
      : await this.waitForRun(run.id, this.requestTimeoutMs(experiment, 180_000));
    if (terminal.status !== 'succeeded')
      throw new OptimizationBacktestFailure(
        terminal.errorCode ?? 'INTERNAL_ERROR',
        `回测 Run ${terminal.id} ${terminal.status}: ${terminal.errorSummary ?? terminal.errorCode ?? 'unknown'}`,
        terminal.id,
      );
    return terminal;
  }

  async dataArtifactFingerprint(job: BacktestJob, range: { start: string; end: string }) {
    const data = await this.backtests.comparableDataFingerprint(job.id, range);
    return optimizationDataArtifactFingerprint(data, toRecord(job.result));
  }

  async requireCompletedRun(id: string, label: string) {
    const run = await this.backtests.statusForRead(id);
    if (!run || run.status !== 'succeeded' || run.result === null || run.result === undefined)
      throw new Error(`${label}冻结 Run 不可访问`);
    return run;
  }

  evaluateResult(run: BacktestJob, objectiveValue: unknown): EvaluationSummary {
    assertCurrentRunForRead(run);
    return evaluateOptimizationResult(run, objectiveValue);
  }

  async recordBaseline(experiment: ExperimentRow, splitName: 'development' | 'validation') {
    const run = await this.executeRun(
      experiment,
      experiment.baselineStrategyVersionId,
      splitName,
      'baseline',
    );
    const summary = this.evaluateResult(run, experiment.objective);
    const fingerprint = await this.dataArtifactFingerprint(
      run,
      this.splitRangeFor(experiment, splitName),
    );
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "baselineRunRefs"=COALESCE("baselineRunRefs", '{}'::jsonb) || ${JSON.stringify({ [splitName]: run.id })}::jsonb,
          "baselineMetrics"=COALESCE("baselineMetrics", '{}'::jsonb) || ${JSON.stringify({ [splitName]: summary })}::jsonb,
          "frozenDataFingerprints"=COALESCE("frozenDataFingerprints", '{}'::jsonb) || ${JSON.stringify({ [splitName]: fingerprint })}::jsonb,
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${experiment.id}::uuid AND "status"='running'
        AND "executionAttempt"=${experiment.executionAttempt} AND "cancelRequestedAt" IS NULL
    `);
    if (updated !== 1) throw new Error('实验基线已被新的执行尝试接管');
    return { run, summary, fingerprint };
  }

  async evaluateCandidateSplit(
    experiment: ExperimentRow,
    strategyVersionId: string,
    candidateId: string,
    splitName: 'development' | 'validation',
    baselineFingerprint: unknown,
  ) {
    const run = await this.executeRun(
      experiment,
      strategyVersionId,
      splitName,
      `candidate:${candidateId}`,
    );
    const fingerprint = await this.dataArtifactFingerprint(
      run,
      this.splitRangeFor(experiment, splitName),
    );
    if (fingerprint !== baselineFingerprint) {
      const summary = invalidOptimizationComparison(this.evaluateResult(run, experiment.objective),
        '候选与基准的数据 Artifact 指纹不一致，实验 fail-closed');
      return { run, summary, fingerprint };
    }
    return { run, summary: this.evaluateResult(run, experiment.objective), fingerprint };
  }
}
import { OptimizationBacktestFailure } from './strategy-optimization-failure.js';
