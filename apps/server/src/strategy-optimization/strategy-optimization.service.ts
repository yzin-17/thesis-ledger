import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  optimizationAdoptSchema,
  optimizationExperimentCloneSchema,
  optimizationExperimentCreateSchema,
  optimizationExperimentRenameSchema,
  optimizationFinalizeSchema,
  type OptimizationAdoptionContext,
  strategySchemaV2,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';
import { AiProviderRegistry } from '../ai/provider-registry.js';
import { PrismaService } from '../platform/prisma.service.js';
import {
  adoptionConflict,
  adoptionIdempotencyMatches,
  adoptionRejected,
  formalizeOptimizationCandidate,
  previousOptimizationAdoption,
  type OptimizationAdoptionRow,
} from './strategy-optimization-adoption.js';
import { StrategyOptimizationCandidateService } from './strategy-optimization-candidate.service.js';
import {
  optimizationAttemptFailureStatus,
  optimizationFeatureEnabled,
  experimentDisplayName,
  redactOptimizationError,
  strategyDefinitionDiff,
  toRecord,
  type CandidateRow,
  type ExperimentRow,
  type StrategyVersionRecord,
} from './strategy-optimization-common.js';
import { describeStrategyParameters } from './strategy-optimization-parameters.js';
import { StrategyOptimizationReadService } from './strategy-optimization-read.service.js';
import {
  buildOptimizationModelConfig,
  type OptimizationModelRoute,
} from './strategy-optimization-model-routing.js';
import {
  assertOptimizationModelConfigCost,
  normalizeCostCurrency,
  optimizationCostError,
  sameOptimizationCostConfirmation,
} from './strategy-optimization-cost.js';
import { StrategyOptimizationRunService } from './strategy-optimization-run.service.js';
import { StrategyRiskApplicationService } from './strategy-risk-application.service.js';
import {
  cloneDiscoveryExperiment,
  createDiscoveryExperiment,
} from './strategy-optimization-discovery-store.js';
import { insertOptimizationExperiment } from './strategy-optimization-experiment.store.js';

@Injectable()
export class StrategyOptimizationService implements OnModuleInit {
  private readonly active = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AiProviderRegistry,
    private readonly candidateService: StrategyOptimizationCandidateService,
    private readonly reads: StrategyOptimizationReadService,
    private readonly runs: StrategyOptimizationRunService,
    private readonly riskApplications: StrategyRiskApplicationService,
  ) {}

  onModuleInit() {
    if (optimizationFeatureEnabled()) void this.reconcilePending().catch(() => undefined);
  }
  private assertEnabled() {
    if (!optimizationFeatureEnabled()) throw new BadRequestException('AI 策略优化当前已关闭');
  }

  private async experiment(id: string) {
    const rows = await this.prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "id"=${id}::uuid AND "ownerKey"='local-user' LIMIT 1
    `);
    const row = rows[0];
    if (!row) throw new NotFoundException('优化实验不存在');
    return row;
  }

  private candidates(id: string) {
    return this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationCandidate" WHERE "experimentId"=${id}::uuid ORDER BY "candidateNumber" ASC
    `);
  }

  async create(input: unknown) {
    this.assertEnabled();
    const parsed = optimizationExperimentCreateSchema.parse(input);
    const modelConfig = buildOptimizationModelConfig(parsed.models, this.providers);
    assertOptimizationModelConfigCost(modelConfig);
    const previous = await this.prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "idempotencyKey"=${parsed.idempotencyKey} LIMIT 1
    `);
    if (previous[0]) {
      if (
        !sameOptimizationCostConfirmation(previous[0], {
          modelConfig,
          budget: parsed.budget,
          maxRounds: parsed.maxRounds,
        })
      )
        throw optimizationCostError(
          'OPTIMIZATION_COST_CONFIRMATION_STALE',
          '模型路线或费用预算已变化，不能复用旧费用确认；请重新创建实验',
        );
      return this.reads.experiment(previous[0].id);
    }
    const hasUnknownCost = modelConfig.some((route) => route.costStatus === 'unknown');
    if (hasUnknownCost && parsed.budget.maxCost !== undefined)
      throw optimizationCostError(
        'OPTIMIZATION_COST_TOTAL_LIMIT_UNAVAILABLE',
        '费用或计费币种未知时不能提交实验总金额上限',
      );
    if (hasUnknownCost && !parsed.acknowledgeUnknownCost)
      throw optimizationCostError(
        'OPTIMIZATION_COST_UNKNOWN_CONFIRMATION_REQUIRED',
        '所选模型存在未知费用；请明确确认后继续，实验总金额上限不可用',
      );
    if (parsed.sourceMode === 'discovery') {
      const created = await createDiscoveryExperiment(this.prisma, parsed, modelConfig);
      void this.process(created.id).catch(() => undefined);
      return this.reads.experiment(created.id);
    }
    const baseline: StrategyVersionRecord & { strategy: StrategySchemaV2 } =
      await this.reads.formalStrategyVersion(parsed.strategyVersionId!);
    const descriptors = describeStrategyParameters(baseline.strategy);
    this.candidateService.validateAuthorizedParameters(descriptors, parsed.allowedParameterIds!);
    const created = await insertOptimizationExperiment(this.prisma, parsed, baseline, modelConfig);
    void this.process(created.id).catch(() => undefined);
    return this.reads.experiment(created.id);
  }

  async clone(id: string, input: unknown) {
    this.assertEnabled();
    const parsed = optimizationExperimentCloneSchema.parse(input);
    const previous = await this.prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "idempotencyKey"=${parsed.idempotencyKey} LIMIT 1
    `);
    if (previous[0]) return this.reads.experiment(previous[0].id);
    const source = await this.experiment(id);
    assertOptimizationModelConfigCost(source.modelConfig);
    const sourceRoutes = Array.isArray(source.modelConfig) ? source.modelConfig : [];
    const hasUnknownCost = sourceRoutes.some((route) => {
      const item = toRecord(route);
      return item.costStatus !== 'known' || !normalizeCostCurrency(item.costCurrency);
    });
    if (hasUnknownCost && toRecord(source.budget).maxCost !== undefined)
      throw optimizationCostError(
        'OPTIMIZATION_COST_TOTAL_LIMIT_UNAVAILABLE',
        '费用或计费币种未知时不能提交实验总金额上限',
      );
    if (hasUnknownCost && parsed.acknowledgeUnknownCost !== true)
      throw optimizationCostError(
        'OPTIMIZATION_COST_UNKNOWN_CONFIRMATION_REQUIRED',
        '所选模型存在未知费用；请明确确认后继续，实验总金额上限不可用',
      );
    const cloneId = randomUUID();
    const inheritedExposure = source.testExposedAt
      ? {
          ...toRecord(source.exposure),
          inheritedFromExperimentId: source.id,
          inheritedTestExposure: true,
          inheritedAt: new Date().toISOString(),
        }
      : { inheritedFromExperimentId: source.id, inheritedTestExposure: false };
    if (source.sourceMode === 'discovery') {
      const created = await cloneDiscoveryExperiment(
        this.prisma,
        source,
        cloneId,
        parsed.idempotencyKey,
        inheritedExposure,
        parsed.name ?? `${experimentDisplayName(source)} · 副本`,
      );
      if (!created) throw new Error('克隆实验创建失败');
      void this.process(created.id).catch(() => undefined);
      return this.reads.experiment(created.id);
    }
    const rows = await this.prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "name", "sourceMode", "discoveryScope", "strategySpaceVersion", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds",
        "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds",
        "idempotencyKey", "testExposedAt", "exposure", "updatedAt"
      ) VALUES (
        ${cloneId}::uuid, ${parsed.name ?? `${experimentDisplayName(source)} · 副本`}, ${source.sourceMode}, ${source.discoveryScope ? JSON.stringify(source.discoveryScope) : null}::jsonb,
        ${source.strategySpaceVersion}, ${source.baselineStrategyVersionId}::uuid, 'queued', 'preparing',
        ${JSON.stringify(source.objective)}::jsonb, ${JSON.stringify(source.allowedParameterIds)}::jsonb,
        ${JSON.stringify(source.split)}::jsonb, ${JSON.stringify(source.runConfig)}::jsonb,
        ${source.dataFingerprint}, ${JSON.stringify(source.modelConfig)}::jsonb,
        ${JSON.stringify(source.budget)}::jsonb, ${source.maxRounds}, ${parsed.idempotencyKey},
        ${source.testExposedAt}, ${JSON.stringify(inheritedExposure)}::jsonb, CURRENT_TIMESTAMP
      ) RETURNING *
    `);
    const created = rows[0];
    if (!created) throw new Error('克隆实验创建失败');
    void this.process(created.id).catch(() => undefined);
    return this.reads.experiment(created.id);
  }

  async cancel(id: string) {
    const current = await this.experiment(id);
    if (['succeeded', 'failed', 'cancelled'].includes(current.status))
      return this.reads.experiment(id);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='cancelled', "stage"='cancelled', "cancelRequestedAt"=CURRENT_TIMESTAMP,
          "stopReason"='user_cancelled', "leaseUntil"=NULL, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "status" NOT IN ('succeeded', 'failed', 'cancelled')
    `);
    return this.reads.experiment(id);
  }

  async rename(id: string, input: unknown) {
    const parsed = optimizationExperimentRenameSchema.parse(input);
    const current = await this.experiment(id);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "name"=${parsed.name}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${current.id}::uuid AND "ownerKey"='local-user'
    `);
    return this.reads.experiment(id);
  }

  private async cancelled(id: string) {
    const current = await this.experiment(id);
    return current.cancelRequestedAt !== null || current.status === 'cancelled';
  }

  private async claim(id: string) {
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='running', "stage"='baseline', "leaseUntil"=${new Date(Date.now() + 3_600_000)},
          "executionAttempt"="executionAttempt"+1, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "status" IN ('queued','running') AND "cancelRequestedAt" IS NULL
        AND ("status"='queued' OR "leaseUntil" IS NULL OR "leaseUntil" < CURRENT_TIMESTAMP)
    `);
  }

  private async ensureBaselines(experiment: ExperimentRow) {
    let current = experiment;
    if (!toRecord(current.baselineRunRefs).development) {
      await this.runs.recordBaseline(current, 'development');
      current = await this.experiment(current.id);
    }
    if (!toRecord(current.baselineRunRefs).validation) {
      await this.runs.recordBaseline(current, 'validation');
      current = await this.experiment(current.id);
    }
    return current;
  }

  private async setStage(id: string, stage: string) {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment" SET "stage"=${stage}, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid
    `);
  }

  private async processRound(
    experiment: ExperimentRow,
    baseline: StrategyVersionRecord & { strategy: StrategySchemaV2 },
    descriptors: ReturnType<typeof describeStrategyParameters>,
    route: OptimizationModelRoute,
    round: number,
  ) {
    if (await this.cancelled(experiment.id)) return null;
    const modelKey = `${route.provider}:${route.model}`;
    try {
      const generated = await this.candidateService.generateProposal(
        experiment,
        baseline,
        descriptors,
        route,
        round,
      );
      if (generated.continuationBlockedReason) return generated.continuationBlockedReason;
      await this.setStage(experiment.id, 'evaluating');
      const outcome = await this.candidateService.createAndEvaluateCandidate(
        experiment,
        baseline,
        descriptors,
        modelKey,
        generated.proposal,
      );
      await this.candidateService.recordAttempt({
        experimentId: experiment.id,
        modelKey,
        aiRunId: generated.aiRunId,
        attempt: round,
        status: outcome.duplicate ? 'duplicate' : outcome.candidate.validationStatus,
        proposal: generated.proposal,
      });
      return null;
    } catch (error) {
      await this.candidateService.recordAttempt({
        experimentId: experiment.id,
        modelKey,
        attempt: round,
        status: optimizationAttemptFailureStatus(error),
        error: redactOptimizationError(error),
      });
      return null;
    }
  }

  private async bestValidationScore(experimentId: string, modelKey: string) {
    const rows = await this.prisma.$queryRaw<Array<{ metrics: unknown }>>(Prisma.sql`
      SELECT "metrics" FROM "OptimizationCandidate"
      WHERE "experimentId"=${experimentId}::uuid AND "modelKey"=${modelKey} AND "validationStatus"='valid'
    `);
    return rows.reduce((best, row) => {
      const score = toRecord(toRecord(row.metrics).validation).score;
      return typeof score === 'number' ? Math.max(best, score) : best;
    }, Number.NEGATIVE_INFINITY);
  }

  private async processModelRounds(
    experiment: ExperimentRow,
    baseline: StrategyVersionRecord & { strategy: StrategySchemaV2 },
  ) {
    const descriptors = describeStrategyParameters(baseline.strategy);
    const routes = experiment.modelConfig as OptimizationModelRoute[];
    const states = new Map(
      routes.map((route) => [
        `${route.provider}:${route.model}`,
        { bestScore: Number.NEGATIVE_INFINITY, stopped: false },
      ]),
    );
    for (let round = 1; round <= experiment.maxRounds; round += 1) {
      for (const route of routes) {
        const modelKey = `${route.provider}:${route.model}`;
        const state = states.get(modelKey);
        if (!state || state.stopped) continue;
        const blocked = await this.processRound(experiment, baseline, descriptors, route, round);
        if (blocked || (await this.cancelled(experiment.id))) return blocked;
        const currentBest = await this.bestValidationScore(experiment.id, modelKey);
        if (round > 1 && currentBest <= state.bestScore) state.stopped = true;
        state.bestScore = Math.max(state.bestScore, currentBest);
      }
    }
  }
  private async finishProposalStage(id: string) {
    const candidates = await this.candidates(id);
    const hasValid = candidates.some((candidate) => candidate.validationStatus === 'valid');
    if (!hasValid) {
      await this.fail(id, 'no_valid_candidate');
      return;
    }
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='awaiting_finalization', "stage"='awaiting_finalization', "leaseUntil"=NULL,
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "cancelRequestedAt" IS NULL
    `);
  }

  private async processClaimed(id: string) {
    let experiment = await this.experiment(id);
    const baselineVersion = await this.prisma.strategyVersion.findUnique({
      where: { id: experiment.baselineStrategyVersionId },
      include: { strategy: true },
    });
    if (!baselineVersion) throw new NotFoundException('实验基线策略版本不存在');
    const parsedBaseline = strategySchemaV2.parse(baselineVersion.schema) as StrategySchemaV2;
    const baseline = { ...baselineVersion, strategy: parsedBaseline };
    experiment = await this.ensureBaselines(experiment);
    await this.setStage(id, 'proposing');
    const continuationBlockedReason = await this.processModelRounds(experiment, baseline);
    if (continuationBlockedReason) return this.fail(id, continuationBlockedReason);
    if (!(await this.cancelled(id))) await this.finishProposalStage(id);
  }

  private async process(id: string) {
    if (this.active.has(id)) return;
    this.active.add(id);
    try {
      if ((await this.claim(id)) === 1) await this.processClaimed(id);
    } catch (error) {
      await this.fail(id, redactOptimizationError(error));
    } finally {
      this.active.delete(id);
    }
  }

  private async fail(id: string, reason: string) {
    await this.prisma
      .$executeRaw(
        Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='failed', "stage"='failed', "leaseUntil"=NULL, "stopReason"=${reason}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "status" <> 'cancelled'
    `,
      )
      .catch(() => undefined);
  }

  async reconcilePending(limit = 100) {
    const bounded = Math.max(1, Math.min(limit, 500));
    const rows = await this.prisma.$queryRaw<Array<{ id: string; stage: string }>>(Prisma.sql`
      SELECT "id", "stage" FROM "OptimizationExperiment"
      WHERE "status" IN ('queued','running','testing') AND "cancelRequestedAt" IS NULL
        AND ("status"='queued' OR "leaseUntil" IS NULL OR "leaseUntil" < CURRENT_TIMESTAMP)
      ORDER BY "createdAt" ASC LIMIT ${bounded}
    `);
    rows.forEach((row) => {
      if (row.stage === 'testing') void this.resumeTesting(row.id).catch(() => undefined);
      else void this.process(row.id).catch(() => undefined);
    });
    return { scheduled: rows.length };
  }

  private async eligibleFinalCandidates(id: string, candidateIds: string[]) {
    const all = await this.candidates(id);
    const selected = all.filter((candidate) => candidateIds.includes(candidate.id));
    if (selected.length !== candidateIds.length)
      throw new BadRequestException('锁定候选不属于当前实验');
    if (
      selected.some(
        (candidate) =>
          !['valid', 'test_failed', 'test_running', 'test_valid', 'test_invalid'].includes(
            candidate.validationStatus,
          ),
      )
    )
      throw new BadRequestException('只有开发/验证均通过的候选可以进入封存测试');
    return selected;
  }

  private assertSameFinalizationLock(
    experiment: ExperimentRow,
    candidateIds: string[],
    selectedCandidateId: string,
  ) {
    const existing = Array.isArray(experiment.lockedCandidateIds)
      ? experiment.lockedCandidateIds.filter((item): item is string => typeof item === 'string')
      : [];
    if (existing.length === 0) return;
    const requested = [...candidateIds].sort();
    const locked = [...existing].sort();
    if (
      JSON.stringify(requested) !== JSON.stringify(locked) ||
      experiment.selectedCandidateId !== selectedCandidateId
    )
      throw new BadRequestException('测试集已开始访问，只允许对原锁定候选进行技术重试');
  }

  private async lockFinalization(
    experiment: ExperimentRow,
    candidateIds: string[],
    selectedCandidateId: string,
  ) {
    this.assertSameFinalizationLock(experiment, candidateIds, selectedCandidateId);
    const updated = await this.prisma.$queryRaw<Array<{ executionAttempt: number }>>(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='testing', "stage"='testing', "lockedCandidateIds"=${JSON.stringify(candidateIds)}::jsonb,
          "selectedCandidateId"=${selectedCandidateId}::uuid, "leaseUntil"=${new Date(Date.now() + 3_600_000)},
          "executionAttempt"="executionAttempt"+1,
          "pausedDurationMs"="pausedDurationMs" + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "updatedAt")) * 1000))::int,
          "testExposedAt"=COALESCE("testExposedAt", CURRENT_TIMESTAMP),
          "exposure"=(CASE WHEN jsonb_typeof("exposure")='object' THEN "exposure" ELSE '{}'::jsonb END
            || ${JSON.stringify({ testAccessStarted: true, lockedCandidateIds: candidateIds, preselectedCandidateId: selectedCandidateId })}::jsonb)
            || CASE WHEN CASE WHEN jsonb_typeof("exposure")='object' THEN "exposure" ELSE '{}'::jsonb END ? 'testRevealed'
              THEN '{}'::jsonb ELSE '{"testRevealed": false}'::jsonb END,
          "stopReason"=NULL, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${experiment.id}::uuid AND "stage"='awaiting_finalization' AND "status"='awaiting_finalization'
        AND "cancelRequestedAt" IS NULL
      RETURNING "executionAttempt"
    `);
    if (updated.length !== 1) throw new BadRequestException('实验封存状态发生并发变化');
    return updated[0]!.executionAttempt;
  }

  private lockedCandidateIds(experiment: ExperimentRow) {
    return Array.isArray(experiment.lockedCandidateIds)
      ? experiment.lockedCandidateIds.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private async finalBaseline(experiment: ExperimentRow, executionAttempt: number) {
    const existingFingerprint = toRecord(experiment.frozenDataFingerprints).test;
    const existingRunId = toRecord(experiment.baselineRunRefs).test;
    const existingMetrics = toRecord(experiment.baselineMetrics).test;
    const hasFrozenBaselineFact = [
      experiment.frozenDataFingerprints,
      experiment.baselineRunRefs,
      experiment.baselineMetrics,
    ].some((value) => Object.prototype.hasOwnProperty.call(toRecord(value), 'test'));
    if (hasFrozenBaselineFact) {
      if (
        typeof existingFingerprint !== 'string' ||
        existingFingerprint.length === 0 ||
        typeof existingRunId !== 'string' ||
        existingRunId.length === 0 ||
        !existingMetrics ||
        typeof existingMetrics !== 'object' ||
        Array.isArray(existingMetrics) ||
        toRecord(existingMetrics).runId !== existingRunId
      )
        throw new Error('封存测试基线冻结事实不完整');
      await this.runs.requireCompletedRun(existingRunId, '封存测试基线');
      return existingFingerprint;
    }
    const run = await this.runs.executeRun(
      experiment,
      experiment.baselineStrategyVersionId,
      'test',
      'baseline-final',
    );
    const summary = this.runs.evaluateResult(run, experiment.objective);
    const split = toRecord(experiment.split).test as { start?: string; end?: string } | undefined;
    if (!split?.start || !split.end) throw new Error('实验缺少 test 数据切分');
    const fingerprint = await this.runs.dataArtifactFingerprint(run, {
      start: split.start,
      end: split.end,
    });
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "baselineRunRefs"=COALESCE("baselineRunRefs", '{}'::jsonb) || ${JSON.stringify({ test: run.id })}::jsonb,
          "baselineMetrics"=COALESCE("baselineMetrics", '{}'::jsonb) || ${JSON.stringify({ test: summary })}::jsonb,
          "frozenDataFingerprints"=COALESCE("frozenDataFingerprints", '{}'::jsonb) || ${JSON.stringify({ test: fingerprint })}::jsonb
      WHERE "id"=${experiment.id}::uuid AND "status"='testing' AND "stage"='testing'
        AND "executionAttempt"=${executionAttempt} AND "cancelRequestedAt" IS NULL
    `);
    if (updated !== 1) throw new Error('封存测试已被更新的执行尝试接管');
    return fingerprint;
  }

  private async candidate(id: string) {
    const rows = await this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationCandidate" WHERE "id"=${id}::uuid LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async claimFinalCandidate(experiment: ExperimentRow, candidateId: string) {
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate" AS c
      SET "validationStatus"='test_running'
      WHERE c."id"=${candidateId}::uuid AND c."experimentId"=${experiment.id}::uuid
        AND c."validationStatus" IN ('valid', 'test_failed', 'test_running')
        AND EXISTS (
          SELECT 1 FROM "OptimizationExperiment" AS e
          WHERE e."id"=c."experimentId" AND e."status"='testing' AND e."stage"='testing'
            AND e."executionAttempt"=${experiment.executionAttempt}
            AND e."cancelRequestedAt" IS NULL
        )
    `);
    return updated === 1;
  }

  private async markFinalCandidateFailure(
    experiment: ExperimentRow,
    candidateId: string,
    error: unknown,
  ) {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate" AS c
      SET "validationStatus"='test_failed'
      WHERE c."id"=${candidateId}::uuid AND c."experimentId"=${experiment.id}::uuid
        AND c."validationStatus"='test_running'
        AND EXISTS (
          SELECT 1 FROM "OptimizationExperiment" AS e
          WHERE e."id"=c."experimentId" AND e."status"='testing' AND e."stage"='testing'
            AND e."executionAttempt"=${experiment.executionAttempt}
            AND e."cancelRequestedAt" IS NULL
        )
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "stopReason"=${`final_test_retry_required:${redactOptimizationError(error)}`},
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${experiment.id}::uuid AND "status"='testing' AND "stage"='testing'
        AND "executionAttempt"=${experiment.executionAttempt} AND "cancelRequestedAt" IS NULL
    `);
  }

  private async finalCandidate(
    experiment: ExperimentRow,
    candidate: CandidateRow,
    fingerprint: string,
  ) {
    const current = (await this.candidate(candidate.id)) ?? candidate;
    if (['test_valid', 'test_invalid'].includes(current.validationStatus)) {
      const existingRunId = toRecord(current.runRefs).test;
      const existingMetrics = toRecord(current.metrics).test;
      if (
        typeof existingRunId === 'string' &&
        existingRunId.length > 0 &&
        existingMetrics &&
        typeof existingMetrics === 'object' &&
        !Array.isArray(existingMetrics) &&
        toRecord(existingMetrics).runId === existingRunId
      ) {
        await this.runs.requireCompletedRun(existingRunId, '封存测试候选');
        return;
      }
      throw new Error('封存测试候选已标记完成但缺少冻结 Run 引用');
    }
    if (!(await this.claimFinalCandidate(experiment, candidate.id))) return;
    try {
      const run = await this.runs.executeRun(
        experiment,
        current.candidateStrategyVersionId,
        'test',
        `candidate-final:${current.id}`,
      );
      const split = toRecord(experiment.split).test as { start?: string; end?: string } | undefined;
      if (!split?.start || !split.end) throw new Error('实验缺少 test 数据切分');
      const sameData =
        (await this.runs.dataArtifactFingerprint(run, {
          start: split.start,
          end: split.end,
        })) === fingerprint;
      const summary = sameData
        ? this.runs.evaluateResult(run, experiment.objective)
        : {
            runId: run.id,
            status: 'invalid' as const,
            completeness: 'unavailable',
            tradeCount: 0,
            reason: '封存测试候选与基准数据 Artifact 指纹不一致',
          };
      const runRefs = { ...toRecord(current.runRefs), test: run.id };
      const metrics = { ...toRecord(current.metrics), test: summary };
      const updated = await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "OptimizationCandidate" AS c
        SET "runRefs"=${JSON.stringify(runRefs)}::jsonb,
            "metrics"=${JSON.stringify(metrics)}::jsonb,
            "validationStatus"=${summary.status === 'valid' ? 'test_valid' : 'test_invalid'}
        WHERE c."id"=${current.id}::uuid AND c."experimentId"=${experiment.id}::uuid
          AND c."validationStatus"='test_running'
          AND EXISTS (
            SELECT 1 FROM "OptimizationExperiment" AS e
            WHERE e."id"=c."experimentId" AND e."status"='testing' AND e."stage"='testing'
              AND e."executionAttempt"=${experiment.executionAttempt}
              AND e."cancelRequestedAt" IS NULL
          )
      `);
      if (updated !== 1) throw new Error('封存测试结果已由更新的执行尝试接管');
    } catch (error) {
      await this.markFinalCandidateFailure(experiment, current.id, error);
      throw error;
    }
  }

  private async completeFinalization(
    id: string,
    candidateIds: string[],
    selectedCandidateId: string,
    executionAttempt: number,
  ) {
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='succeeded', "stage"='completed', "testExposedAt"=COALESCE("testExposedAt", CURRENT_TIMESTAMP),
          "exposure"=(CASE WHEN jsonb_typeof("exposure")='object' THEN "exposure" ELSE '{}'::jsonb END)
            || ${JSON.stringify({ testRevealed: true, testRevealedAt: new Date().toISOString(), lockedCandidateIds: candidateIds, preselectedCandidateId: selectedCandidateId })}::jsonb,
          "leaseUntil"=NULL, "stopReason"=NULL, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "status"='testing' AND "stage"='testing'
        AND "executionAttempt"=${executionAttempt} AND "cancelRequestedAt" IS NULL
        AND jsonb_typeof("baselineRunRefs"->'test')='string'
        AND NULLIF("baselineRunRefs"->>'test', '') IS NOT NULL
        AND jsonb_typeof("baselineMetrics"->'test')='object'
        AND ("baselineMetrics"->'test'->>'runId')=("baselineRunRefs"->>'test')
        AND jsonb_typeof("frozenDataFingerprints"->'test')='string'
        AND NULLIF("frozenDataFingerprints"->>'test', '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE("lockedCandidateIds", '[]'::jsonb)) AS locked("id")
          LEFT JOIN "OptimizationCandidate" AS c ON c."id"=locked."id"::uuid
          WHERE c."id" IS NULL
             OR c."experimentId"<>"OptimizationExperiment"."id"
             OR c."validationStatus" NOT IN ('test_valid', 'test_invalid')
             OR jsonb_typeof(c."runRefs"->'test') IS DISTINCT FROM 'string'
             OR NULLIF(c."runRefs"->>'test', '') IS NULL
             OR jsonb_typeof(c."metrics"->'test') IS DISTINCT FROM 'object'
             OR (c."metrics"->'test'->>'runId') IS DISTINCT FROM (c."runRefs"->>'test')
        )
    `);
    return updated === 1;
  }

  private async releaseFinalizationForRetry(id: string, executionAttempt: number, error: unknown) {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='awaiting_finalization', "stage"='awaiting_finalization', "leaseUntil"=NULL,
          "stopReason"=${`final_test_retry_required:${redactOptimizationError(error)}`},
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "status"='testing' AND "stage"='testing'
        AND "executionAttempt"=${executionAttempt} AND "cancelRequestedAt" IS NULL
    `);
  }

  private async runFinalization(id: string, executionAttempt: number) {
    const testingExperiment = await this.experiment(id);
    const lockedIds = this.lockedCandidateIds(testingExperiment);
    if (!testingExperiment.selectedCandidateId || lockedIds.length === 0)
      throw new Error('封存测试缺少原子锁定的候选集合');
    const candidates = await this.eligibleFinalCandidates(id, lockedIds);
    const fingerprint = await this.finalBaseline(testingExperiment, executionAttempt);
    for (const candidate of candidates)
      await this.finalCandidate(testingExperiment, candidate, fingerprint);
    const completed = await this.completeFinalization(
      id,
      lockedIds,
      testingExperiment.selectedCandidateId,
      executionAttempt,
    );
    if (!completed) throw new Error('封存测试尚未完成，结果保持隐藏');
    return this.reads.compare(id);
  }

  private async claimTesting(id: string) {
    const rows = await this.prisma.$queryRaw<Array<{ executionAttempt: number }>>(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "leaseUntil"=${new Date(Date.now() + 3_600_000)},
          "executionAttempt"="executionAttempt"+1, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "status"='testing' AND "stage"='testing'
        AND "cancelRequestedAt" IS NULL
        AND ("leaseUntil" IS NULL OR "leaseUntil" < CURRENT_TIMESTAMP)
      RETURNING "executionAttempt"
    `);
    return rows[0]?.executionAttempt ?? null;
  }

  private async resumeTesting(id: string) {
    if (this.active.has(id)) return;
    this.active.add(id);
    try {
      const executionAttempt = await this.claimTesting(id);
      if (executionAttempt === null) return;
      try {
        await this.runFinalization(id, executionAttempt);
      } catch (error) {
        await this.releaseFinalizationForRetry(id, executionAttempt, error);
      }
    } finally {
      this.active.delete(id);
    }
  }

  async finalize(id: string, input: unknown) {
    this.assertEnabled();
    const parsed = optimizationFinalizeSchema.parse(input);
    const experiment = await this.experiment(id);
    if (experiment.stage !== parsed.expectedStage || experiment.status !== 'awaiting_finalization')
      throw new BadRequestException('实验当前不能进入最终测试');
    await this.eligibleFinalCandidates(id, parsed.candidateIds);
    const executionAttempt = await this.lockFinalization(
      experiment,
      parsed.candidateIds,
      parsed.selectedCandidateId,
    );
    try {
      return await this.runFinalization(id, executionAttempt);
    } catch (error) {
      await this.releaseFinalizationForRetry(id, executionAttempt, error);
      throw error;
    }
  }

  private async adoptionVersionSnapshot(id: string) {
    const version = await this.prisma.strategyVersion.findUnique({ where: { id } });
    if (!version) throw adoptionRejected('ADOPTION_SOURCE_MISMATCH', '采纳来源版本不存在');
    const parsed = strategySchemaV2.safeParse(version.schema);
    if (!parsed.success || version.schemaVersion !== 2)
      throw adoptionRejected('ADOPTION_SOURCE_MISMATCH', '采纳来源不是可审阅的正式 V2 策略定义');
    return {
      id: version.id,
      strategyId: version.strategyId,
      version: version.version,
      schemaVersion: version.schemaVersion,
      schema: parsed.data,
    } satisfies OptimizationAdoptionContext['baseline'];
  }

  private async currentFormalVersion(strategyId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "StrategyVersion"
      WHERE "strategyId"=${strategyId}::uuid AND "version">0
      ORDER BY "version" DESC LIMIT 1
    `);
    return rows[0] ? this.adoptionVersionSnapshot(rows[0].id) : null;
  }

  private async adoptionCandidateSnapshot(experimentId: string, candidateId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; candidateStrategyVersionId: string; executionHash: string }>
    >(Prisma.sql`
      SELECT "id", "candidateStrategyVersionId", "executionHash"
      FROM "OptimizationCandidate"
      WHERE "experimentId"=${experimentId}::uuid AND "id"=${candidateId}::uuid LIMIT 1
    `);
    const candidate = rows[0];
    if (!candidate) throw new NotFoundException('候选不存在');
    return {
      ...(await this.adoptionVersionSnapshot(candidate.candidateStrategyVersionId)),
      candidateId: candidate.id,
      executionHash: candidate.executionHash,
    } satisfies OptimizationAdoptionContext['candidate'];
  }

  private async buildAdoptionContext(
    experimentId: string,
    candidateId: string,
    baselineStrategyVersionId: string,
    confirmedCurrentStrategyVersionId: string | null,
  ): Promise<OptimizationAdoptionContext> {
    const baseline = await this.adoptionVersionSnapshot(baselineStrategyVersionId);
    const candidate = await this.adoptionCandidateSnapshot(experimentId, candidateId);
    const current = confirmedCurrentStrategyVersionId
      ? await this.adoptionVersionSnapshot(confirmedCurrentStrategyVersionId)
      : null;
    if (candidate.strategyId !== baseline.strategyId)
      throw adoptionRejected('ADOPTION_SOURCE_MISMATCH', '实验基线与候选不属于同一策略来源');
    return {
      experimentId,
      candidateId,
      expectedStrategyVersion: current?.version ?? 0,
      baseline,
      current,
      candidate,
      candidateVsBaseline: strategyDefinitionDiff(baseline.schema, candidate.schema),
      candidateVsCurrent: current ? strategyDefinitionDiff(current.schema, candidate.schema) : [],
    };
  }

  async adoptionContext(id: string, candidateId: string) {
    const detail = await this.reads.get(id);
    if (detail.experiment.readEligibility.state !== 'readable')
      throw adoptionRejected('ADOPTION_NOT_REVEALED', '封存测试结果尚未明确揭示，不能确认采纳');
    const candidate = detail.candidates.find((item) => item.id === candidateId);
    if (!candidate) throw new NotFoundException('候选不存在');
    const current =
      detail.experiment.sourceMode === 'existing'
        ? await this.currentFormalVersion(
            detail.experiment.source.kind === 'existing'
              ? detail.experiment.source.strategyId
              : candidate.candidateStrategyVersionId,
          )
        : null;
    return this.buildAdoptionContext(
      id,
      candidateId,
      detail.experiment.baselineStrategyVersionId,
      current?.id ?? null,
    );
  }

  private async adoptionResponse(adoption: OptimizationAdoptionRow) {
    const experiment = await this.experiment(adoption.experimentId);
    const context = await this.buildAdoptionContext(
      adoption.experimentId,
      adoption.candidateId,
      adoption.baselineStrategyVersionId ?? experiment.baselineStrategyVersionId,
      adoption.confirmedCurrentStrategyVersionId,
    );
    const strategyVersion = await this.prisma.strategyVersion.findUnique({
      where: { id: adoption.formalStrategyVersionId },
    });
    if (!strategyVersion) throw new NotFoundException('采纳后的正式版本不存在');
    const monitoringPlan = await this.riskApplications.monitoringPlan(strategyVersion.id);
    const before = context.current
      ? await this.riskApplications.monitoringPlan(context.current.id)
      : null;
    return {
      strategyVersion,
      source: {
        experimentId: adoption.experimentId,
        candidateId: adoption.candidateId,
        candidateHash: adoption.candidateHash,
      },
      adoptionContext: context,
      monitoringPlan,
      monitoringDiff: { before, after: monitoringPlan },
      riskApplicationEnabled: false,
    };
  }

  async adopt(id: string, input: unknown) {
    this.assertEnabled();
    const parsed = optimizationAdoptSchema.parse(input);
    const previous = await previousOptimizationAdoption(this.prisma, parsed.idempotencyKey);
    if (previous) {
      if (
        previous.experimentId !== id ||
        previous.candidateId !== parsed.candidateId ||
        previous.candidateHash !== parsed.candidateHash
      )
        throw adoptionConflict('ADOPTION_IDEMPOTENCY_CONFLICT', '幂等键已绑定其他采纳意图');
      if (
        !(await adoptionIdempotencyMatches(this.prisma, previous, parsed.expectedStrategyVersion))
      )
        throw adoptionConflict('ADOPTION_IDEMPOTENCY_CONFLICT', '幂等键绑定的确认版本已变化');
      return this.adoptionResponse(previous);
    }
    const detail = await this.reads.get(id);
    if (detail.experiment.readEligibility.state !== 'readable')
      throw adoptionRejected('ADOPTION_NOT_REVEALED', '封存测试结果尚未明确揭示，不能采纳');
    if (detail.experiment.status !== 'succeeded' || detail.experiment.stage !== 'completed')
      throw adoptionRejected('ADOPTION_NOT_ELIGIBLE', '实验尚未完成封存测试');
    if (
      detail.experiment.testExposedAt &&
      parsed.candidateId !== detail.experiment.selectedCandidateId &&
      !parsed.acknowledgeTestExposure
    )
      throw adoptionRejected(
        'ADOPTION_NOT_ELIGIBLE',
        '测试集已经揭示；改选其他候选需要明确确认测试暴露',
      );
    const candidate = detail.candidates.find((item) => item.id === parsed.candidateId);
    if (!candidate) throw new NotFoundException('候选不存在');
    if (candidate.validationStatus !== 'test_valid')
      throw adoptionRejected('ADOPTION_NOT_ELIGIBLE', '只有封存测试通过的候选可以采纳');
    if (candidate.executionHash !== parsed.candidateHash)
      throw adoptionRejected(
        'ADOPTION_CANDIDATE_HASH_MISMATCH',
        '候选执行哈希已变化，必须重新验证',
      );
    const adoption = await formalizeOptimizationCandidate(
      this.prisma,
      id,
      parsed.candidateId,
      parsed.candidateHash,
      parsed.expectedStrategyVersion,
      parsed.idempotencyKey,
    );
    return this.adoptionResponse(adoption);
  }
}
