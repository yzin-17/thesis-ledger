import { randomUUID } from 'node:crypto';
import { OptimizationBacktestFailure } from './strategy-optimization-failure.js';
import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  optimizationAdoptSchema,
  isCompletedOptimizationCandidate,
  optimizationExperimentCloneSchema,
  optimizationExperimentRenameSchema,
  type OptimizationAdoptionContext,
  strategySchema,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { AiProviderRegistry } from '../ai/provider-registry.js';
import { PrismaService } from '../platform/prisma.service.js';
import {
  adoptionConflict,
  adoptionIdempotencyMatches,
  candidateOptimizationAdoption,
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
  type OptimizationModelRoute,
} from './strategy-optimization-model-routing.js';
import {
  assertOptimizationModelConfigCost,
  normalizeCostCurrency,
  optimizationCostError,
} from './strategy-optimization-cost.js';
import { StrategyOptimizationRunService } from './strategy-optimization-run.service.js';
import { StrategyRiskApplicationService } from './strategy-risk-application.service.js';
import {
  cloneDiscoveryExperiment,
} from './strategy-optimization-discovery-store.js';
import { createOptimizationExperiment } from './strategy-optimization-create.js';
import { concludeOptimizationProposalStage } from './strategy-optimization-proposal-stage.js';
import { OptimizationFinalization } from './strategy-optimization-finalization.js';
import { requestOptimizationRetry } from './strategy-optimization-retry.js';
import { optimizationRetryStateSchema } from '@thesis-ledger/schemas';
import { committedOptimizationAdoptionResponse } from './strategy-optimization-adoption-response.js';

@Injectable()
export class StrategyOptimizationService implements OnModuleInit {
  private readonly active = new Set<string>();
  private readonly finalization: OptimizationFinalization;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AiProviderRegistry,
    private readonly candidateService: StrategyOptimizationCandidateService,
    private readonly reads: StrategyOptimizationReadService,
    private readonly runs: StrategyOptimizationRunService,
    private readonly riskApplications: StrategyRiskApplicationService,
  ) {
    this.finalization = new OptimizationFinalization(prisma, runs, reads, this.active);
  }

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
    return createOptimizationExperiment(input, { prisma: this.prisma, providers: this.providers,
      reads: this.reads, candidates: this.candidateService, process: id => this.process(id) });
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

  private async setStage(experiment: ExperimentRow, stage: string) {
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment" SET "stage"=${stage}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${experiment.id}::uuid AND "status"='running'
        AND "executionAttempt"=${experiment.executionAttempt} AND "cancelRequestedAt" IS NULL
    `);
    if (updated !== 1) throw new Error('实验已被新的执行尝试接管');
  }

  private async processRound(
    experiment: ExperimentRow,
    baseline: StrategyVersionRecord & { strategy: BacktestStrategy },
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
      await this.setStage(experiment, 'evaluating');
      await this.candidateService.createAndEvaluateCandidate(
        experiment,
        baseline,
        descriptors,
        modelKey,
        generated.proposal,
      );
      return null;
    } catch (error) {
      await this.candidateService.recordAttempt({
        experimentId: experiment.id,
        modelKey,
        attempt: round,
        status: optimizationAttemptFailureStatus(error),
        error: redactOptimizationError(error),
      });
      return error instanceof OptimizationBacktestFailure ? redactOptimizationError(error) : null;
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
    baseline: StrategyVersionRecord & { strategy: BacktestStrategy },
  ) {
    const descriptors = describeStrategyParameters(baseline.strategy);
    const routes = experiment.modelConfig as OptimizationModelRoute[];
    const states = new Map(
      routes.map((route) => [
        `${route.provider}:${route.model}`,
        { bestScore: Number.NEGATIVE_INFINITY, stopped: false },
      ]),
    );
    const { roundOffset } = optimizationRetryStateSchema.parse(experiment.retryState ?? {});
    for (let round = roundOffset + 1; round <= roundOffset + experiment.maxRounds; round += 1) {
      for (const route of routes) {
        const modelKey = `${route.provider}:${route.model}`;
        const state = states.get(modelKey);
        if (!state || state.stopped) continue;
        const blocked = await this.processRound(experiment, baseline, descriptors, route, round);
        if (blocked || (await this.cancelled(experiment.id))) return blocked;
        const currentBest = await this.bestValidationScore(experiment.id, modelKey);
        if (round > roundOffset + 1 && currentBest <= state.bestScore) state.stopped = true;
        state.bestScore = Math.max(state.bestScore, currentBest);
      }
    }
  }
  private async finishProposalStage(id: string, executionAttempt: number) {
    const reason = await concludeOptimizationProposalStage(
      this.prisma,
      id,
      await this.candidates(id),
      executionAttempt,
    );
    if (reason) return;
    await this.finalization.complete(id).catch(() => undefined);
  }

  private async processClaimed(id: string, expectedExecutionAttempt?: number) {
    let experiment = await this.experiment(id);
    if (expectedExecutionAttempt !== undefined && experiment.executionAttempt !== expectedExecutionAttempt)
      throw new Error('实验已被新的执行尝试接管');
    const executionAttempt = experiment.executionAttempt;
    const baselineVersion = await this.prisma.strategyVersion.findUnique({
      where: { id: experiment.baselineStrategyVersionId },
      include: { strategy: true },
    });
    if (!baselineVersion) throw new NotFoundException('实验基线策略版本不存在');
    const parsedBaseline = strategySchema.parse(baselineVersion.schema) as BacktestStrategy;
    const baseline = { ...baselineVersion, strategy: parsedBaseline };
    await this.runs.assertFrozenResearchBudget(experiment);
    experiment = await this.ensureBaselines(experiment);
    await this.setStage(experiment, 'proposing');
    const continuationBlockedReason = await this.processModelRounds(experiment, baseline);
    if (continuationBlockedReason) return this.fail(id, continuationBlockedReason, executionAttempt);
    if (!(await this.cancelled(id))) await this.finishProposalStage(id, executionAttempt);
  }

  private async process(id: string) {
    if (this.active.has(id)) return;
    this.active.add(id);
    let executionAttempt: number | undefined;
    try {
      if ((await this.claim(id)) === 1) {
        executionAttempt = (await this.experiment(id)).executionAttempt;
        await this.processClaimed(id, executionAttempt);
      }
    } catch (error) {
      if (executionAttempt !== undefined) await this.fail(id, redactOptimizationError(error), executionAttempt);
    } finally {
      this.active.delete(id);
    }
  }

  private async fail(id: string, reason: string, executionAttempt: number) {
    await this.prisma
      .$executeRaw(
        Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='failed', "stage"='failed', "leaseUntil"=NULL, "stopReason"=${reason}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "status"='running' AND "executionAttempt"=${executionAttempt}
        AND "cancelRequestedAt" IS NULL
    `,
      )
      .catch(() => undefined);
  }

  async reconcilePending(limit = 100) {
    const bounded = Math.max(1, Math.min(limit, 500));
    const rows = await this.prisma.$queryRaw<Array<{ id: string; stage: string }>>(Prisma.sql`
      SELECT "id", "stage" FROM "OptimizationExperiment"
      WHERE ("status" IN ('queued','running','testing') OR
        ("status"='awaiting_finalization' AND "stopReason" IS NULL AND
          COALESCE("lockedCandidateIds", '[]'::jsonb)='[]'::jsonb)) AND "cancelRequestedAt" IS NULL
        AND ("status"='queued' OR "leaseUntil" IS NULL OR "leaseUntil" < CURRENT_TIMESTAMP)
      ORDER BY "createdAt" ASC LIMIT ${bounded}
    `);
    rows.forEach((row) => {
      if (row.stage === 'testing') void this.finalization.resumeTesting(row.id).catch(() => undefined);
      else if (row.stage === 'awaiting_finalization') void this.finalization.resumeAutomatic(row.id).catch(() => undefined);
      else void this.process(row.id).catch(() => undefined);
    });
    return { scheduled: rows.length };
  }

  async complete(id: string) {
    this.assertEnabled();
    return this.finalization.complete(id);
  }

  async retry(id: string, input: unknown) {
    this.assertEnabled();
    const { accepted } = await requestOptimizationRetry(this.prisma, id, input);
    if (accepted) void this.process(id).catch(() => undefined);
    return this.reads.experiment(id);
  }

  async finalize(id: string, input: unknown) {
    this.assertEnabled();
    return this.finalization.finalize(id, input);
  }

  private async adoptionVersionSnapshot(id: string) {
    const version = await this.prisma.strategyVersion.findUnique({ where: { id } });
    if (!version) throw adoptionRejected('ADOPTION_SOURCE_MISMATCH', '采纳来源版本不存在');
    const parsed = strategySchema.safeParse(version.schema);
    if (!parsed.success || ![2, 3].includes(version.schemaVersion))
      throw adoptionRejected('ADOPTION_SOURCE_MISMATCH', '采纳来源不是可审阅的策略定义');
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
    const baseline = await this.adoptionVersionSnapshot(detail.experiment.baselineStrategyVersionId);
    const current = await this.currentFormalVersion(baseline.strategyId);
    return this.buildAdoptionContext(
      id,
      candidateId,
      detail.experiment.baselineStrategyVersionId,
      current?.id ?? null,
    );
  }

  private async adoptionResponse(adoption: OptimizationAdoptionRow) {
    return committedOptimizationAdoptionResponse(adoption, async () => {
      const experiment = await this.experiment(adoption.experimentId);
      const context = await this.buildAdoptionContext(
        adoption.experimentId, adoption.candidateId,
        adoption.baselineStrategyVersionId ?? experiment.baselineStrategyVersionId,
        adoption.confirmedCurrentStrategyVersionId,
      );
      const monitoringPlan = await this.riskApplications.monitoringPlan(adoption.formalStrategyVersionId);
      const before = context.current ? await this.riskApplications.monitoringPlan(context.current.id) : null;
      const riskApplicationDiffs = await this.riskApplications.planDiffsForTargetVersion(adoption.formalStrategyVersionId);
      return { adoptionContext: context, monitoringPlan, monitoringDiff: { before, after: monitoringPlan }, riskApplicationDiffs };
    });
  }

  async adoptionStatus(id: string, candidateId: string) {
    await this.experiment(id);
    const adoption = await candidateOptimizationAdoption(this.prisma, candidateId);
    if (!adoption || adoption.experimentId !== id) return null;
    return this.adoptionResponse(adoption);
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
    if (!isCompletedOptimizationCandidate(candidate.validationStatus))
      throw adoptionRejected('ADOPTION_NOT_ELIGIBLE', '候选评估尚未完成');
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
