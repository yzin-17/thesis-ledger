import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DecimalValue } from '@thesis-ledger/domain';
import {
  backtestResultSchemaV2,
  optimizationAdoptSchema,
  optimizationExperimentCreateSchema,
  optimizationFinalizeSchema,
  optimizationProposalSchema,
  strategySchemaV2,
  type BacktestResultV2,
  type OptimizationExperimentCreate,
  type OptimizationProposal,
  type RunConfig,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';
import { AiRunService } from '../ai/ai-run.service.js';
import { AiProviderRegistry } from '../ai/provider-registry.js';
import { BacktestService } from '../backtest/backtest.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import {
  applyOptimizationProposal,
  describeStrategyParameters,
  proposalDiff,
} from './strategy-optimization-parameters.js';
import { StrategyRiskApplicationService } from './strategy-risk-application.service.js';

type ExperimentRow = {
  id: string;
  ownerKey: string;
  baselineStrategyVersionId: string;
  status: string;
  stage: string;
  objective: unknown;
  allowedParameterIds: unknown;
  split: unknown;
  runConfig: unknown;
  dataFingerprint: string;
  modelConfig: unknown;
  budget: unknown;
  maxRounds: number;
  aiCallsUsed: number;
  backtestRunsUsed: number;
  costUsed: Prisma.Decimal;
  baselineRunRefs: unknown;
  baselineMetrics: unknown;
  frozenDataFingerprints: unknown;
  lockedCandidateIds: unknown;
  selectedCandidateId: string | null;
  testExposedAt: Date | null;
  exposure: unknown;
  stopReason: string | null;
  cancelRequestedAt: Date | null;
  leaseUntil: Date | null;
  executionAttempt: number;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
};

type CandidateRow = {
  id: string;
  experimentId: string;
  candidateNumber: number;
  modelKey: string;
  candidateStrategyVersionId: string;
  executionHash: string;
  parentCandidateId: string | null;
  proposal: unknown;
  diff: unknown;
  validationStatus: string;
  duplicateOfId: string | null;
  runRefs: unknown;
  metrics: unknown;
  adoptedStrategyVersionId: string | null;
  createdAt: Date;
};

type AttemptRow = {
  id: string;
  experimentId: string;
  modelKey: string;
  aiRunId: string | null;
  attempt: number;
  status: string;
  proposal: unknown;
  error: string | null;
  createdAt: Date;
};

type StrategyVersionRecord = {
  id: string;
  strategyId: string;
  version: number;
  schemaVersion: number;
  schema: unknown;
};

type SplitName = 'development' | 'validation' | 'test';

type EvaluationSummary = {
  runId: string;
  status: 'valid' | 'invalid';
  completeness: string;
  tradeCount: number;
  totalReturn?: string;
  maxDrawdown?: string;
  turnover?: string;
  score?: number;
  reason?: string;
};

const featureEnabled = () => process.env.STRATEGY_AI_OPTIMIZATION_ENABLED !== 'false';
const sha256 = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(value, Object.keys(value as object).sort()))
    .digest('hex');
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const redact = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/(?:sk-|api[_-]?key[=:])\S+/giu, '[REDACTED]')
    .slice(0, 500);

const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const toRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

@Injectable()
export class StrategyOptimizationService implements OnModuleInit {
  private readonly active = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly backtests: BacktestService,
    private readonly aiRuns: AiRunService,
    private readonly providers: AiProviderRegistry,
    private readonly riskApplications: StrategyRiskApplicationService,
  ) {}

  onModuleInit() {
    void this.resumePending().catch(() => undefined);
  }

  private assertEnabled() {
    if (!featureEnabled()) throw new BadRequestException('AI 策略优化当前已关闭');
  }

  capabilities() {
    return {
      riskApplicationsEnabled: process.env.STRATEGY_RISK_APPLICATIONS_ENABLED !== 'false',
      aiOptimizationEnabled: featureEnabled(),
      providers: this.providers.list().flatMap((provider) =>
        provider.models.map((model) => ({ provider: provider.id, model })),
      ),
    };
  }

  private async formalStrategyVersion(id: string) {
    const version = await this.prisma.strategyVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('策略版本不存在');
    if (version.schemaVersion !== 2 || version.version <= 0)
      throw new BadRequestException('AI 优化只能从正式 V2 策略版本开始');
    return { ...version, strategy: strategySchemaV2.parse(version.schema) as StrategySchemaV2 };
  }

  private async experiment(id: string) {
    const rows = await this.prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "id" = ${id}::uuid AND "ownerKey" = 'local-user' LIMIT 1
    `);
    const row = rows[0];
    if (!row) throw new NotFoundException('优化实验不存在');
    return row;
  }

  private candidates(id: string) {
    return this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationCandidate" WHERE "experimentId" = ${id}::uuid ORDER BY "candidateNumber" ASC
    `);
  }

  private attempts(id: string) {
    return this.prisma.$queryRaw<AttemptRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationAttempt" WHERE "experimentId" = ${id}::uuid ORDER BY "createdAt" ASC, "id" ASC
    `);
  }

  async get(id: string) {
    const experiment = await this.experiment(id);
    const [candidates, attempts] = await Promise.all([this.candidates(id), this.attempts(id)]);
    return { experiment, candidates, attempts };
  }

  async list(limit = 30) {
    const bounded = Math.max(1, Math.min(limit, 100));
    return this.prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment"
      WHERE "ownerKey" = 'local-user'
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT ${bounded}
    `);
  }

  async create(input: unknown) {
    this.assertEnabled();
    const parsed = optimizationExperimentCreateSchema.parse(input);
    const previous = await this.prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "idempotencyKey" = ${parsed.idempotencyKey} LIMIT 1
    `);
    if (previous[0]) return previous[0];
    const version = await this.formalStrategyVersion(parsed.strategyVersionId);
    const descriptors = describeStrategyParameters(version.strategy);
    const descriptorIds = new Set(descriptors.map((item) => item.parameterId));
    for (const parameterId of parsed.allowedParameterIds) {
      if (!descriptorIds.has(parameterId)) throw new BadRequestException(`不可优化的参数: ${parameterId}`);
    }
    for (const route of parsed.models) this.providers.strict(route.provider, route.model);
    const id = randomUUID();
    const dataFingerprint = sha256({
      schema: version.strategy,
      runConfig: parsed.runConfig,
      split: parsed.split,
      semanticVersion: 'strategy-optimization-v1',
    });
    const rows = await this.prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds",
        "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds", "idempotencyKey", "updatedAt"
      ) VALUES (
        ${id}::uuid, ${parsed.strategyVersionId}::uuid, 'queued', 'preparing', ${JSON.stringify(parsed.objective)}::jsonb,
        ${JSON.stringify(parsed.allowedParameterIds)}::jsonb, ${JSON.stringify(parsed.split)}::jsonb,
        ${JSON.stringify(parsed.runConfig)}::jsonb, ${dataFingerprint}, ${JSON.stringify(parsed.models)}::jsonb,
        ${JSON.stringify(parsed.budget)}::jsonb, ${parsed.maxRounds}, ${parsed.idempotencyKey}, CURRENT_TIMESTAMP
      ) RETURNING *
    `);
    const created = rows[0]!;
    void this.process(created.id).catch(() => undefined);
    return created;
  }

  async cancel(id: string) {
    const experiment = await this.experiment(id);
    if (['succeeded', 'failed', 'cancelled'].includes(experiment.status)) return experiment;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='cancelled', "stage"='cancelled', "cancelRequestedAt"=CURRENT_TIMESTAMP,
          "stopReason"='user_cancelled', "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid
    `);
    return this.experiment(id);
  }

  private async cancelled(id: string) {
    const current = await this.experiment(id);
    return current.cancelRequestedAt !== null || current.status === 'cancelled';
  }

  private async reserveBudget(id: string, input: { aiCalls?: number; backtestRuns?: number; estimatedCost?: number }) {
    const aiCalls = input.aiCalls ?? 0;
    const runs = input.backtestRuns ?? 0;
    const estimatedCost = input.estimatedCost ?? 0;
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "aiCallsUsed"="aiCallsUsed"+${aiCalls}, "backtestRunsUsed"="backtestRunsUsed"+${runs},
          "costUsed"="costUsed"+${estimatedCost}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "cancelRequestedAt" IS NULL
        AND "aiCallsUsed"+${aiCalls} <= (("budget"->>'maxAiCalls')::int)
        AND "backtestRunsUsed"+${runs} <= (("budget"->>'maxBacktestRuns')::int)
        AND (("budget"->>'maxCost') IS NULL OR "costUsed"+${estimatedCost} <= (("budget"->>'maxCost')::decimal))
    `);
    if (updated !== 1) throw new BadRequestException('优化实验预算已耗尽或实验已取消');
  }

  private async reconcileCost(id: string, estimated: number, actual: number) {
    const delta = actual - estimated;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment" SET "costUsed"="costUsed"+${delta}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid
    `);
    const experiment = await this.experiment(id);
    const budget = toRecord(experiment.budget);
    const maxCost = typeof budget.maxCost === 'string' ? budget.maxCost : undefined;
    if (maxCost !== undefined && DecimalValue.from(experiment.costUsed.toString()).compareTo(maxCost) > 0)
      throw new BadRequestException('优化实验实际模型费用超过预算，已停止新任务');
  }

  private runConfigForSplit(experiment: ExperimentRow, splitName: SplitName) {
    const base = experiment.runConfig as RunConfig;
    const split = toRecord(experiment.split)[splitName] as { start?: string; end?: string } | undefined;
    if (!split?.start || !split.end) throw new Error(`实验缺少 ${splitName} 数据切分`);
    return { ...base, startDate: split.start, endDate: split.end } satisfies RunConfig;
  }

  private dataArtifactFingerprint(job: { snapshotManifest?: unknown }) {
    const manifest = toRecord(job.snapshotManifest);
    const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
    const facts = artifacts
      .map((item) => toRecord(item))
      .filter((item) => typeof item.key === 'string' && !item.key.startsWith('metadata/'))
      .map((item) => ({ key: item.key, contentHash: item.contentHash }))
      .sort((left, right) => String(left.key).localeCompare(String(right.key)));
    return sha256(facts);
  }

  private async waitForRun(id: string, timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const job = await this.backtests.status(id);
      if (job && ['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
      await sleep(150);
    }
    throw new Error(`V2 Run 等待超时: ${id}`);
  }

  private async executeRun(
    experiment: ExperimentRow,
    strategyVersionId: string,
    splitName: SplitName,
    identity: string,
  ) {
    await this.reserveBudget(experiment.id, { backtestRuns: 1 });
    const run = await this.backtests.createRun({
      strategyVersionId,
      runConfig: this.runConfigForSplit(experiment, splitName),
      idempotencyKey: `optimization:${experiment.id}:${identity}:${splitName}`,
    });
    if (run.status === 'queued') await this.backtests.runV2(run.id);
    const terminal = ['succeeded', 'failed', 'cancelled'].includes(run.status)
      ? run
      : await this.waitForRun(run.id);
    if (terminal.status !== 'succeeded')
      throw new Error(`V2 Run ${terminal.id} ${terminal.status}: ${terminal.errorSummary ?? terminal.errorCode ?? 'unknown'}`);
    return terminal;
  }

  private metric(result: BacktestResultV2, aliases: string[]) {
    for (const key of aliases) {
      const item = result.metrics[key];
      if (item?.status === 'available' && item.value !== undefined) return item.value;
    }
    return undefined;
  }

  private evaluateResult(
    run: { id: string; result: unknown },
    objectiveValue: unknown,
  ): EvaluationSummary {
    const result = backtestResultSchemaV2.parse(run.result);
    const objective = toRecord(objectiveValue);
    const totalReturn = this.metric(result, ['totalReturn', 'cumulativeReturn', 'return']);
    const maxDrawdown = this.metric(result, ['maxDrawdown', 'drawdown']);
    const turnover = this.metric(result, ['turnover', 'turnoverRate']);
    if (result.completeness !== 'complete')
      return {
        runId: run.id,
        status: 'invalid',
        completeness: result.completeness,
        tradeCount: result.trades.length,
        reason: '回测数据完整性不是 complete',
      };
    const minimumTrades = typeof objective.minClosedTrades === 'number' ? objective.minClosedTrades : 1;
    if (result.trades.length < minimumTrades)
      return {
        runId: run.id,
        status: 'invalid',
        completeness: result.completeness,
        tradeCount: result.trades.length,
        reason: `闭合交易少于 ${minimumTrades}`,
      };
    if (!totalReturn || !maxDrawdown)
      return {
        runId: run.id,
        status: 'invalid',
        completeness: result.completeness,
        tradeCount: result.trades.length,
        reason: '关键收益/回撤指标不可用',
      };
    const drawdownMagnitude = DecimalValue.from(maxDrawdown).isNegative()
      ? DecimalValue.from('0').minus(maxDrawdown)
      : DecimalValue.from(maxDrawdown);
    if (
      typeof objective.maxDrawdown === 'string' &&
      drawdownMagnitude.compareTo(objective.maxDrawdown) > 0
    ) {
      return {
        runId: run.id,
        status: 'invalid',
        completeness: result.completeness,
        tradeCount: result.trades.length,
        totalReturn,
        maxDrawdown,
        ...(turnover ? { turnover } : {}),
        reason: '最大回撤超过硬约束',
      };
    }
    const returnNumber = Number(totalReturn);
    const drawdownNumber = Number(drawdownMagnitude.toString());
    const turnoverNumber = turnover ? Number(turnover) : 0;
    const mode = objective.mode;
    const score =
      mode === 'return'
        ? returnNumber
        : mode === 'drawdown'
          ? -drawdownNumber
          : mode === 'lowTurnover'
            ? returnNumber - turnoverNumber
            : returnNumber - drawdownNumber - turnoverNumber * 0.05;
    return {
      runId: run.id,
      status: 'valid',
      completeness: result.completeness,
      tradeCount: result.trades.length,
      totalReturn,
      maxDrawdown,
      ...(turnover ? { turnover } : {}),
      score,
    };
  }

  private async recordBaseline(experiment: ExperimentRow, splitName: 'development' | 'validation') {
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
  }

  private prompt(
    experiment: ExperimentRow,
    strategy: StrategySchemaV2,
    descriptors: ReturnType<typeof describeStrategyParameters>,
    modelKey: string,
    round: number,
  ) {
    const allowed = new Set(experiment.allowedParameterIds as string[]);
    const authorized = descriptors.filter((item) => allowed.has(item.parameterId));
    return [
      {
        role: 'system',
        content:
          '你是策略参数优化器。只能修改允许的 parameterId；不得修改数据、费用之外的锁定结构、执行语义或生成代码。只输出 OptimizationProposal JSON。不得声明收益率或回测结果。',
      },
      {
        role: 'user',
        content: `OPTIMIZATION_REQUEST_JSON:${JSON.stringify({
          semanticVersion: 'strategy-optimization-v1',
          modelKey,
          round,
          objective: experiment.objective,
          authorizedParameters: authorized,
          baselineMetrics: experiment.baselineMetrics,
          strategy: {
            name: strategy.name,
            primaryTimeframe: strategy.primaryTimeframe,
            executionInstrument: strategy.executionInstrument,
          },
        })}`,
      },
    ];
  }

  private async nextNegativeVersion(strategyId: string) {
    const min = await this.prisma.strategyVersion.aggregate({
      where: { strategyId },
      _min: { version: true },
    });
    return Math.min(min._min.version ?? 0, 0) - 1;
  }

  private async createCandidateVersion(baseline: StrategyVersionRecord, strategy: StrategySchemaV2) {
    return this.prisma.strategyVersion.create({
      data: {
        strategyId: baseline.strategyId,
        version: await this.nextNegativeVersion(baseline.strategyId),
        schemaVersion: 2,
        schema: asJson(strategy),
      },
    });
  }

  private async proposalForModel(
    experiment: ExperimentRow,
    baseline: StrategyVersionRecord & { strategy: StrategySchemaV2 },
    descriptors: ReturnType<typeof describeStrategyParameters>,
    route: { provider: string; model: string },
    round: number,
  ) {
    const modelKey = `${route.provider}:${route.model}`;
    const estimatedCost = 0;
    await this.reserveBudget(experiment.id, { aiCalls: 1, estimatedCost });
    const aiRun = await this.aiRuns.start(
      route.provider,
      route.model,
      'strategy-optimization-v1',
      { scope: 'strategy', strategyVersionId: baseline.id },
      { optimizationExperimentId: experiment.id, requestedProvider: route.provider, requestedModel: route.model, round },
      `优化策略 ${baseline.strategy.name}`,
    );
    const startedAt = Date.now();
    try {
      const provider = this.providers.strict(route.provider, route.model);
      const completion = await provider.complete(
        { model: route.model, messages: this.prompt(experiment, baseline.strategy, descriptors, modelKey, round), tools: [] },
        AbortSignal.timeout(60_000),
      );
      const proposal = optimizationProposalSchema.parse(completion.content);
      await this.prisma.aiRun.update({
        where: { id: aiRun.id },
        data: {
          status: 'succeeded',
          result: asJson(proposal),
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          cost: completion.cost,
          durationMs: Date.now() - startedAt,
          completedAt: new Date(),
          modelMetadata: asJson({
            optimizationExperimentId: experiment.id,
            requestedProvider: route.provider,
            actualProvider: provider.id,
            requestedModel: route.model,
            actualModel: route.model,
            round,
            fallbackUsed: false,
          }),
        },
      });
      await this.reconcileCost(experiment.id, estimatedCost, completion.cost);
      return { proposal, aiRunId: aiRun.id, modelKey };
    } catch (error) {
      await this.aiRuns.fail(aiRun.id, 'optimization_proposal_failed', redact(error), Date.now() - startedAt);
      throw error;
    }
  }

  private async insertAttempt(input: {
    experimentId: string;
    modelKey: string;
    aiRunId?: string;
    attempt: number;
    status: string;
    proposal?: OptimizationProposal;
    error?: string;
  }) {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationAttempt" ("experimentId", "modelKey", "aiRunId", "attempt", "status", "proposal", "error")
      VALUES (${input.experimentId}::uuid, ${input.modelKey}, ${input.aiRunId ?? null}::uuid, ${input.attempt}, ${input.status},
        ${input.proposal ? JSON.stringify(input.proposal) : null}::jsonb, ${input.error ?? null})
      ON CONFLICT ("experimentId", "modelKey", "attempt") DO UPDATE SET
        "status"=EXCLUDED."status", "proposal"=EXCLUDED."proposal", "error"=EXCLUDED."error", "aiRunId"=EXCLUDED."aiRunId"
    `);
  }

  private async createAndEvaluateCandidate(
    experiment: ExperimentRow,
    baseline: StrategyVersionRecord & { strategy: StrategySchemaV2 },
    descriptors: ReturnType<typeof describeStrategyParameters>,
    modelKey: string,
    proposal: OptimizationProposal,
  ) {
    const candidateStrategy = applyOptimizationProposal(
      baseline.strategy,
      descriptors,
      experiment.allowedParameterIds as string[],
      proposal,
    );
    const executionHash = sha256(candidateStrategy);
    const duplicates = await this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationCandidate" WHERE "experimentId"=${experiment.id}::uuid AND "executionHash"=${executionHash} LIMIT 1
    `);
    if (duplicates[0]) return { candidate: duplicates[0], duplicate: true };
    const version = await this.createCandidateVersion(baseline, candidateStrategy);
    const count = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "OptimizationCandidate" WHERE "experimentId"=${experiment.id}::uuid
    `);
    const candidateNumber = Number(count[0]?.count ?? 0n) + 1;
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      INSERT INTO "OptimizationCandidate" (
        "id", "experimentId", "candidateNumber", "modelKey", "candidateStrategyVersionId", "executionHash",
        "proposal", "diff", "validationStatus", "runRefs", "metrics"
      ) VALUES (
        ${id}::uuid, ${experiment.id}::uuid, ${candidateNumber}, ${modelKey}, ${version.id}::uuid, ${executionHash},
        ${JSON.stringify(proposal)}::jsonb, ${JSON.stringify(proposalDiff(baseline.strategy, candidateStrategy, descriptors))}::jsonb,
        'evaluating', '{}'::jsonb, '{}'::jsonb
      ) RETURNING *
    `);
    const candidate = rows[0]!;
    const baselineFingerprints = toRecord((await this.experiment(experiment.id)).frozenDataFingerprints);
    const summaries: Record<string, EvaluationSummary> = {};
    const runRefs: Record<string, string> = {};
    for (const splitName of ['development', 'validation'] as const) {
      const run = await this.executeRun(experiment, version.id, splitName, `candidate:${id}`);
      const fingerprint = this.dataArtifactFingerprint(run);
      if (fingerprint !== baselineFingerprints[splitName]) {
        summaries[splitName] = {
          runId: run.id,
          status: 'invalid',
          completeness: 'unavailable',
          tradeCount: 0,
          reason: '候选与基准的数据 Artifact 指纹不一致，实验 fail-closed',
        };
      } else summaries[splitName] = this.evaluateResult(run, experiment.objective);
      runRefs[splitName] = run.id;
    }
    const valid = summaries.development?.status === 'valid' && summaries.validation?.status === 'valid';
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "runRefs"=${JSON.stringify(runRefs)}::jsonb, "metrics"=${JSON.stringify(summaries)}::jsonb,
          "validationStatus"=${valid ? 'valid' : 'invalid'}
      WHERE "id"=${id}::uuid
    `);
    return { candidate: { ...candidate, runRefs, metrics: summaries, validationStatus: valid ? 'valid' : 'invalid' }, duplicate: false };
  }

  private async process(id: string) {
    if (this.active.has(id)) return;
    this.active.add(id);
    try {
      const claimed = await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "OptimizationExperiment"
        SET "status"='running', "stage"='baseline', "leaseUntil"=${new Date(Date.now() + 120_000)},
            "executionAttempt"="executionAttempt"+1, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${id}::uuid AND "status" IN ('queued','running') AND "cancelRequestedAt" IS NULL
      `);
      if (claimed !== 1) return;
      let experiment = await this.experiment(id);
      const baseline = await this.formalStrategyVersion(experiment.baselineStrategyVersionId);
      const descriptors = describeStrategyParameters(baseline.strategy);
      const currentBaselineRefs = toRecord(experiment.baselineRunRefs);
      if (!currentBaselineRefs.development) await this.recordBaseline(experiment, 'development');
      experiment = await this.experiment(id);
      if (!toRecord(experiment.baselineRunRefs).validation) await this.recordBaseline(experiment, 'validation');
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "OptimizationExperiment" SET "stage"='proposing', "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid
      `);
      experiment = await this.experiment(id);
      const routes = experiment.modelConfig as Array<{ provider: string; model: string }>;
      for (const route of routes) {
        for (let round = 1; round <= experiment.maxRounds; round += 1) {
          if (await this.cancelled(id)) return;
          try {
            const generated = await this.proposalForModel(experiment, baseline, descriptors, route, round);
            await this.insertAttempt({
              experimentId: id,
              modelKey: generated.modelKey,
              aiRunId: generated.aiRunId,
              attempt: round,
              status: 'proposed',
              proposal: generated.proposal,
            });
            await this.prisma.$executeRaw(Prisma.sql`
              UPDATE "OptimizationExperiment" SET "stage"='evaluating', "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid
            `);
            const outcome = await this.createAndEvaluateCandidate(
              experiment,
              baseline,
              descriptors,
              generated.modelKey,
              generated.proposal,
            );
            await this.insertAttempt({
              experimentId: id,
              modelKey: generated.modelKey,
              aiRunId: generated.aiRunId,
              attempt: round,
              status: outcome.duplicate ? 'duplicate' : outcome.candidate.validationStatus,
              proposal: generated.proposal,
            });
          } catch (error) {
            await this.insertAttempt({
              experimentId: id,
              modelKey: `${route.provider}:${route.model}`,
              attempt: round,
              status: 'failed',
              error: redact(error),
            });
            if (error instanceof BadRequestException && /预算/.test(error.message)) break;
          }
        }
      }
      const candidates = await this.candidates(id);
      if (!candidates.some((candidate) => candidate.validationStatus === 'valid')) {
        await this.prisma.$executeRaw(Prisma.sql`
          UPDATE "OptimizationExperiment" SET "status"='failed', "stage"='failed',
            "stopReason"='no_valid_candidate', "leaseUntil"=NULL, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid
        `);
        return;
      }
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "OptimizationExperiment" SET "status"='awaiting_finalization', "stage"='awaiting_finalization',
          "leaseUntil"=NULL, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "cancelRequestedAt" IS NULL
      `);
    } catch (error) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "OptimizationExperiment" SET "status"='failed', "stage"='failed', "leaseUntil"=NULL,
          "stopReason"=${redact(error)}, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${id}::uuid AND "status" <> 'cancelled'
      `).catch(() => undefined);
    } finally {
      this.active.delete(id);
    }
  }

  private async resumePending() {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "OptimizationExperiment"
      WHERE "status" IN ('queued','running') AND "cancelRequestedAt" IS NULL
        AND ("leaseUntil" IS NULL OR "leaseUntil" < CURRENT_TIMESTAMP)
      ORDER BY "createdAt" ASC LIMIT 10
    `);
    for (const row of rows) void this.process(row.id).catch(() => undefined);
  }

  async compare(id: string) {
    const { experiment, candidates, attempts } = await this.get(id);
    const ranked = candidates
      .map((candidate) => {
        const validation = toRecord(candidate.metrics).validation as EvaluationSummary | undefined;
        return { ...candidate, validationScore: validation?.score ?? null };
      })
      .sort((left, right) => (right.validationScore ?? -Infinity) - (left.validationScore ?? -Infinity));
    return {
      experiment,
      baseline: { runRefs: experiment.baselineRunRefs, metrics: experiment.baselineMetrics },
      candidates: ranked,
      attempts,
      note: '排序仅使用 Server 真实回测的 validation 指标；AI 自述指标不会进入评分。',
    };
  }

  async finalize(id: string, input: unknown) {
    this.assertEnabled();
    const parsed = optimizationFinalizeSchema.parse(input);
    const experiment = await this.experiment(id);
    if (experiment.stage !== parsed.expectedStage || experiment.status !== 'awaiting_finalization')
      throw new BadRequestException('实验当前不能进入最终测试');
    const candidates = await this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationCandidate"
      WHERE "experimentId"=${id}::uuid AND "id" IN (${Prisma.join(parsed.candidateIds.map((candidateId) => Prisma.sql`${candidateId}::uuid`))})
    `);
    if (candidates.length !== parsed.candidateIds.length)
      throw new BadRequestException('锁定候选不属于当前实验');
    if (candidates.some((candidate) => candidate.validationStatus !== 'valid'))
      throw new BadRequestException('只有开发/验证均通过的候选可以进入封存测试');
    const locked = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='testing', "stage"='testing', "lockedCandidateIds"=${JSON.stringify(parsed.candidateIds)}::jsonb,
          "selectedCandidateId"=${parsed.selectedCandidateId}::uuid, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "stage"='awaiting_finalization' AND "cancelRequestedAt" IS NULL
    `);
    if (locked !== 1) throw new BadRequestException('实验封存状态发生并发变化');
    try {
      const baselineRun = await this.executeRun(experiment, experiment.baselineStrategyVersionId, 'test', 'baseline-final');
      const baselineSummary = this.evaluateResult(baselineRun, experiment.objective);
      const baselineFingerprint = this.dataArtifactFingerprint(baselineRun);
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "OptimizationExperiment"
        SET "baselineRunRefs"=COALESCE("baselineRunRefs", '{}'::jsonb) || ${JSON.stringify({ test: baselineRun.id })}::jsonb,
            "baselineMetrics"=COALESCE("baselineMetrics", '{}'::jsonb) || ${JSON.stringify({ test: baselineSummary })}::jsonb,
            "frozenDataFingerprints"=COALESCE("frozenDataFingerprints", '{}'::jsonb) || ${JSON.stringify({ test: baselineFingerprint })}::jsonb
        WHERE "id"=${id}::uuid
      `);
      for (const candidate of candidates) {
        const run = await this.executeRun(experiment, candidate.candidateStrategyVersionId, 'test', `candidate-final:${candidate.id}`);
        const candidateFingerprint = this.dataArtifactFingerprint(run);
        const summary =
          candidateFingerprint === baselineFingerprint
            ? this.evaluateResult(run, experiment.objective)
            : ({
                runId: run.id,
                status: 'invalid',
                completeness: 'unavailable',
                tradeCount: 0,
                reason: '封存测试候选与基准数据 Artifact 指纹不一致',
              } satisfies EvaluationSummary);
        const runRefs = { ...toRecord(candidate.runRefs), test: run.id };
        const metrics = { ...toRecord(candidate.metrics), test: summary };
        await this.prisma.$executeRaw(Prisma.sql`
          UPDATE "OptimizationCandidate" SET "runRefs"=${JSON.stringify(runRefs)}::jsonb,
            "metrics"=${JSON.stringify(metrics)}::jsonb,
            "validationStatus"=${summary.status === 'valid' ? 'test_valid' : 'test_invalid'}
          WHERE "id"=${candidate.id}::uuid
        `);
      }
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "OptimizationExperiment"
        SET "status"='succeeded', "stage"='completed', "testExposedAt"=CURRENT_TIMESTAMP,
          "exposure"=${JSON.stringify({ testRevealed: true, lockedCandidateIds: parsed.candidateIds, preselectedCandidateId: parsed.selectedCandidateId })}::jsonb,
          "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${id}::uuid
      `);
      return this.compare(id);
    } catch (error) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "OptimizationExperiment" SET "status"='failed', "stage"='failed', "stopReason"=${redact(error)}, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${id}::uuid
      `);
      throw error;
    }
  }

  async adopt(id: string, input: unknown) {
    this.assertEnabled();
    const parsed = optimizationAdoptSchema.parse(input);
    const existing = await this.prisma.$queryRaw<Array<{ formalStrategyVersionId: string }>>(Prisma.sql`
      SELECT "formalStrategyVersionId" FROM "OptimizationAdoption" WHERE "idempotencyKey"=${parsed.idempotencyKey} LIMIT 1
    `);
    if (existing[0]) {
      const formal = await this.prisma.strategyVersion.findUnique({ where: { id: existing[0].formalStrategyVersionId } });
      return { strategyVersion: formal, monitoringPlan: formal ? await this.riskApplications.monitoringPlan(formal.id) : null };
    }
    const experiment = await this.experiment(id);
    if (experiment.status !== 'succeeded' || experiment.stage !== 'completed')
      throw new BadRequestException('实验尚未完成封存测试');
    if (
      experiment.testExposedAt &&
      parsed.candidateId !== experiment.selectedCandidateId &&
      !parsed.acknowledgeTestExposure
    ) {
      throw new BadRequestException('测试集已经揭示；改选其他候选需要明确确认测试暴露');
    }
    const rows = await this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationCandidate" WHERE "experimentId"=${id}::uuid AND "id"=${parsed.candidateId}::uuid LIMIT 1
    `);
    const candidate = rows[0];
    if (!candidate) throw new NotFoundException('候选不存在');
    if (candidate.executionHash !== parsed.candidateHash)
      throw new BadRequestException('候选执行哈希已变化，必须重新验证');
    if (!['test_valid', 'test_invalid'].includes(candidate.validationStatus))
      throw new BadRequestException('候选没有封存测试结果');
    const candidateVersion = await this.prisma.strategyVersion.findUnique({ where: { id: candidate.candidateStrategyVersionId } });
    if (!candidateVersion) throw new NotFoundException('候选策略版本不存在');
    const latest = await this.prisma.strategyVersion.aggregate({
      where: { strategyId: candidateVersion.strategyId, version: { gt: 0 } },
      _max: { version: true },
    });
    if ((latest._max.version ?? 0) !== parsed.expectedStrategyVersion)
      throw new BadRequestException('正式策略已经发布新版本，请重新确认采纳');
    const formal = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.strategyVersion.create({
        data: {
          strategyId: candidateVersion.strategyId,
          version: parsed.expectedStrategyVersion + 1,
          schemaVersion: 2,
          schema: candidateVersion.schema as Prisma.InputJsonValue,
        },
      });
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "OptimizationAdoption" ("experimentId", "candidateId", "idempotencyKey", "candidateHash", "formalStrategyVersionId")
        VALUES (${id}::uuid, ${candidate.id}::uuid, ${parsed.idempotencyKey}, ${parsed.candidateHash}, ${created.id}::uuid)
      `);
      await transaction.$executeRaw(Prisma.sql`
        UPDATE "OptimizationCandidate" SET "adoptedStrategyVersionId"=${created.id}::uuid WHERE "id"=${candidate.id}::uuid
      `);
      return created;
    });
    const monitoringPlan = await this.riskApplications.monitoringPlan(formal.id);
    const baselinePlan = await this.riskApplications.monitoringPlan(experiment.baselineStrategyVersionId);
    return {
      strategyVersion: formal,
      source: { experimentId: id, candidateId: candidate.id, candidateHash: candidate.executionHash },
      monitoringPlan,
      monitoringDiff: {
        before: baselinePlan,
        after: monitoringPlan,
      },
      riskApplicationEnabled: false,
    };
  }
}
