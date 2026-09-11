import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DecimalValue } from '@thesis-ledger/domain';
import {
  backtestResultSchemaV2,
  type BacktestResultV2,
  type RunConfig,
} from '@thesis-ledger/schemas';
import { BacktestService } from '../backtest/backtest.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import {
  optimizationRemainingDurationMs,
  optimizationSha256,
  toRecord,
  type EvaluationSummary,
  type ExperimentRow,
  type SplitName,
} from './strategy-optimization-common.js';

type BacktestJob = NonNullable<Awaited<ReturnType<BacktestService['status']>>>;

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const metricValue = (result: BacktestResultV2, aliases: string[]) => {
  for (const key of aliases) {
    const item = result.metrics[key];
    if (item?.status === 'available' && item.value !== undefined) return item.value;
  }
  return undefined;
};

const invalidSummary = (
  runId: string,
  result: BacktestResultV2,
  reason: string,
): EvaluationSummary => ({
  runId,
  status: 'invalid',
  completeness: result.completeness,
  tradeCount: result.trades.length,
  reason,
});

const drawdownMagnitude = (value: string) => {
  const parsed = DecimalValue.from(value);
  return parsed.isNegative() ? DecimalValue.from('0').minus(parsed) : parsed;
};

const calculateScore = (
  mode: unknown,
  totalReturn: string,
  maxDrawdown: string,
  turnover?: string,
) => {
  const returnNumber = Number(totalReturn);
  const drawdownNumber = Number(drawdownMagnitude(maxDrawdown).toString());
  const turnoverNumber = turnover ? Number(turnover) : 0;
  if (mode === 'return') return returnNumber;
  if (mode === 'drawdown') return -drawdownNumber;
  if (mode === 'lowTurnover') return returnNumber - turnoverNumber;
  return returnNumber - drawdownNumber - turnoverNumber * 0.05;
};

@Injectable()
export class StrategyOptimizationRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backtests: BacktestService,
  ) {}

  async reserveBudget(
    id: string,
    input: { aiCalls?: number; backtestRuns?: number; estimatedCost?: number },
  ) {
    const aiCalls = input.aiCalls ?? 0;
    const runs = input.backtestRuns ?? 0;
    const estimatedCost = input.estimatedCost ?? 0;
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "aiCallsUsed"="aiCallsUsed"+${aiCalls}, "backtestRunsUsed"="backtestRunsUsed"+${runs},
          "costUsed"="costUsed"+${estimatedCost}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "cancelRequestedAt" IS NULL
        AND (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "createdAt")) * 1000 - "pausedDurationMs")
          <= COALESCE(NULLIF("budget"->>'maxDurationSeconds', '')::int, 1800) * 1000
        AND "aiCallsUsed"+${aiCalls} <= (("budget"->>'maxAiCalls')::int)
        AND "backtestRunsUsed"+${runs} <= (("budget"->>'maxBacktestRuns')::int)
        AND (("budget"->>'maxCost') IS NULL OR "costUsed"+${estimatedCost} <= (("budget"->>'maxCost')::decimal))
    `);
    if (updated !== 1)
      throw new BadRequestException('优化实验预算或最长运行时长已耗尽，或实验已取消');
  }

  async reconcileCost(id: string, estimated: number, actual: number) {
    const delta = actual - estimated;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment" SET "costUsed"="costUsed"+${delta}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid
    `);
    const rows = await this.prisma.$queryRaw<Array<{ costUsed: Prisma.Decimal; budget: unknown }>>(Prisma.sql`
      SELECT "costUsed", "budget" FROM "OptimizationExperiment" WHERE "id"=${id}::uuid LIMIT 1
    `);
    const row = rows[0];
    if (!row) return;
    const maxCost = toRecord(row.budget).maxCost;
    if (typeof maxCost === 'string' && DecimalValue.from(row.costUsed.toString()).compareTo(maxCost) > 0)
      throw new BadRequestException('优化实验实际模型费用超过预算，已停止新任务');
  }

  private runConfigForSplit(experiment: ExperimentRow, splitName: SplitName) {
    const base = experiment.runConfig as RunConfig;
    const split = toRecord(experiment.split)[splitName] as { start?: string; end?: string } | undefined;
    if (!split?.start || !split.end) throw new Error(`实验缺少 ${splitName} 数据切分`);
    return { ...base, startDate: split.start, endDate: split.end } satisfies RunConfig;
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
    throw new Error(`V2 Run 等待超时: ${id}`);
  }

  async executeRun(
    experiment: ExperimentRow,
    strategyVersionId: string,
    splitName: SplitName,
    identity: string,
  ): Promise<BacktestJob> {
    await this.touchLease(experiment.id);
    await this.reserveBudget(experiment.id, { backtestRuns: 1 });
    const run = await this.backtests.createRun({
      strategyVersionId,
      runConfig: this.runConfigForSplit(experiment, splitName),
      idempotencyKey: `optimization:${experiment.id}:${identity}:${splitName}`,
    });
    if (!run) throw new Error('V2 Run 创建后未找到持久化记录');
    if (run.status === 'queued') await this.backtests.runV2(run.id);
    const terminal = ['succeeded', 'failed', 'cancelled'].includes(run.status)
      ? run
      : await this.waitForRun(run.id, this.requestTimeoutMs(experiment, 180_000));
    if (terminal.status !== 'succeeded')
      throw new Error(
        `V2 Run ${terminal.id} ${terminal.status}: ${terminal.errorSummary ?? terminal.errorCode ?? 'unknown'}`,
      );
    return terminal;
  }

  dataArtifactFingerprint(job: BacktestJob) {
    const manifest = toRecord(job.snapshotManifest);
    const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
    const facts = artifacts
      .map((item) => toRecord(item))
      .filter((item) => typeof item.key === 'string' && !item.key.startsWith('metadata/'))
      .map((item) => ({ key: item.key, contentHash: item.contentHash }))
      .sort((left, right) => String(left.key).localeCompare(String(right.key)));
    return optimizationSha256(facts);
  }

  evaluateResult(run: BacktestJob, objectiveValue: unknown): EvaluationSummary {
    const result = backtestResultSchemaV2.parse(run.result);
    if (result.completeness !== 'complete')
      return invalidSummary(run.id, result, '回测数据完整性不是 complete');
    const objective = toRecord(objectiveValue);
    const minimumTrades = typeof objective.minClosedTrades === 'number' ? objective.minClosedTrades : 1;
    if (result.trades.length < minimumTrades)
      return invalidSummary(run.id, result, `闭合交易少于 ${minimumTrades}`);
    const totalReturn = metricValue(result, ['totalReturn', 'cumulativeReturn', 'return']);
    const maxDrawdown = metricValue(result, ['maxDrawdown', 'drawdown']);
    if (!totalReturn || !maxDrawdown)
      return invalidSummary(run.id, result, '关键收益/回撤指标不可用');
    const turnover = metricValue(result, ['turnover', 'turnoverRate']);
    const maxAllowed = typeof objective.maxDrawdown === 'string' ? objective.maxDrawdown : undefined;
    if (maxAllowed && drawdownMagnitude(maxDrawdown).compareTo(maxAllowed) > 0)
      return {
        ...invalidSummary(run.id, result, '最大回撤超过硬约束'),
        totalReturn,
        maxDrawdown,
        ...(turnover ? { turnover } : {}),
      };
    return {
      runId: run.id,
      status: 'valid',
      completeness: result.completeness,
      tradeCount: result.trades.length,
      totalReturn,
      maxDrawdown,
      ...(turnover ? { turnover } : {}),
      score: calculateScore(objective.mode, totalReturn, maxDrawdown, turnover),
    };
  }

  async recordBaseline(experiment: ExperimentRow, splitName: 'development' | 'validation') {
    const run = await this.executeRun(
      experiment,
      experiment.baselineStrategyVersionId,
      splitName,
      'baseline',
    );
    const summary = this.evaluateResult(run, experiment.objective);
    const fingerprint = this.dataArtifactFingerprint(run);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "baselineRunRefs"=COALESCE("baselineRunRefs", '{}'::jsonb) || ${JSON.stringify({ [splitName]: run.id })}::jsonb,
          "baselineMetrics"=COALESCE("baselineMetrics", '{}'::jsonb) || ${JSON.stringify({ [splitName]: summary })}::jsonb,
          "frozenDataFingerprints"=COALESCE("frozenDataFingerprints", '{}'::jsonb) || ${JSON.stringify({ [splitName]: fingerprint })}::jsonb,
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${experiment.id}::uuid
    `);
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
    const fingerprint = this.dataArtifactFingerprint(run);
    if (fingerprint !== baselineFingerprint) {
      const summary: EvaluationSummary = {
        runId: run.id,
        status: 'invalid',
        completeness: 'unavailable',
        tradeCount: 0,
        reason: '候选与基准的数据 Artifact 指纹不一致，实验 fail-closed',
      };
      return { run, summary, fingerprint };
    }
    return { run, summary: this.evaluateResult(run, experiment.objective), fingerprint };
  }
}
