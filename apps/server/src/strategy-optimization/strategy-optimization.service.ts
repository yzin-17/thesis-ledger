import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  optimizationAdoptSchema,
  optimizationExperimentCloneSchema,
  optimizationExperimentCreateSchema,
  optimizationFinalizeSchema,
  strategySchemaV2,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';
import { AiProviderRegistry } from '../ai/provider-registry.js';
import { PrismaService } from '../platform/prisma.service.js';
import { StrategyOptimizationCandidateService } from './strategy-optimization-candidate.service.js';
import {
  optimizationAttemptFailureStatus,
  optimizationFeatureEnabled,
  optimizationSha256,
  redactOptimizationError,
  toRecord,
  type CandidateRow,
  type ExperimentRow,
  type StrategyVersionRecord,
} from './strategy-optimization-common.js';
import { describeStrategyParameters } from './strategy-optimization-parameters.js';
import { StrategyOptimizationRunService } from './strategy-optimization-run.service.js';
import { StrategyRiskApplicationService } from './strategy-risk-application.service.js';

@Injectable()
export class StrategyOptimizationService implements OnModuleInit {
  private readonly active = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AiProviderRegistry,
    private readonly candidateService: StrategyOptimizationCandidateService,
    private readonly runs: StrategyOptimizationRunService,
    private readonly riskApplications: StrategyRiskApplicationService,
  ) {}

  onModuleInit() {
    void this.resumePending().catch(() => undefined);
  }

  private assertEnabled() {
    if (!optimizationFeatureEnabled()) throw new BadRequestException('AI 策略优化当前已关闭');
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
    const previous = await this.prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "idempotencyKey"=${parsed.idempotencyKey} LIMIT 1
    `);
    if (previous[0]) return previous[0];
    const baseline = await this.formalStrategyVersion(parsed.strategyVersionId);
    const descriptors = describeStrategyParameters(baseline.strategy);
    this.candidateService.validateAuthorizedParameters(descriptors, parsed.allowedParameterIds);
    const modelConfig = parsed.models.map((route) => {
      const provider = this.providers.strict(route.provider, route.model);
      const costKnown =
        typeof provider.metadata?.costPer1kInput === 'number' &&
        typeof provider.metadata?.costPer1kOutput === 'number';
      return {
        ...route,
        costStatus: costKnown ? ('known' as const) : ('unknown' as const),
        ...(provider.metadata?.costCurrency ? { costCurrency: provider.metadata.costCurrency } : {}),
        ...(provider.metadata?.pricingVersion ? { pricingVersion: provider.metadata.pricingVersion } : {}),
      };
    });
    if (modelConfig.some((route) => route.costStatus === 'unknown') && !parsed.acknowledgeUnknownCost)
      throw new BadRequestException('所选模型存在未知费用；请明确确认费用上限不可保证');
    const created = await this.insertExperiment(parsed, baseline, modelConfig);
    void this.process(created.id).catch(() => undefined);
    return created;
  }

  private async insertExperiment(
    parsed: ReturnType<typeof optimizationExperimentCreateSchema.parse>,
    baseline: StrategyVersionRecord & { strategy: StrategySchemaV2 },
    modelConfig: Array<{
      provider: string;
      model: string;
      costStatus: 'known' | 'unknown';
      costCurrency?: string;
      pricingVersion?: string;
    }>,
  ) {
    const id = randomUUID();
    const dataFingerprint = optimizationSha256({
      schema: baseline.strategy,
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
        ${JSON.stringify(parsed.runConfig)}::jsonb, ${dataFingerprint}, ${JSON.stringify(modelConfig)}::jsonb,
        ${JSON.stringify(parsed.budget)}::jsonb, ${parsed.maxRounds}, ${parsed.idempotencyKey}, CURRENT_TIMESTAMP
      ) RETURNING *
    `);
    return rows[0]!;
  }

  async clone(id: string, input: unknown) {
    this.assertEnabled();
    const parsed = optimizationExperimentCloneSchema.parse(input);
    const previous = await this.prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "idempotencyKey"=${parsed.idempotencyKey} LIMIT 1
    `);
    if (previous[0]) return previous[0];
    const source = await this.experiment(id);
    const cloneId = randomUUID();
    const inheritedExposure = source.testExposedAt
      ? { ...toRecord(source.exposure), inheritedFromExperimentId: source.id, inheritedTestExposure: true, inheritedAt: new Date().toISOString() }
      : { inheritedFromExperimentId: source.id, inheritedTestExposure: false };
    const rows = await this.prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds",
        "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds",
        "idempotencyKey", "testExposedAt", "exposure", "updatedAt"
      ) VALUES (
        ${cloneId}::uuid, ${source.baselineStrategyVersionId}::uuid, 'queued', 'preparing',
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
    return created;
  }

  async cancel(id: string) {
    const current = await this.experiment(id);
    if (['succeeded', 'failed', 'cancelled'].includes(current.status)) return current;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='cancelled', "stage"='cancelled', "cancelRequestedAt"=CURRENT_TIMESTAMP,
          "stopReason"='user_cancelled', "leaseUntil"=NULL, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid
    `);
    return this.experiment(id);
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
    route: { provider: string; model: string },
    round: number,
  ) {
    if (await this.cancelled(experiment.id)) return;
    const modelKey = `${route.provider}:${route.model}`;
    try {
      const generated = await this.candidateService.generateProposal(
        experiment,
        baseline,
        descriptors,
        route,
        round,
      );
      await this.candidateService.recordAttempt({
        experimentId: experiment.id,
        modelKey,
        aiRunId: generated.aiRunId,
        attempt: round,
        status: 'proposed',
        proposal: generated.proposal,
      });
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
    } catch (error) {
      await this.candidateService.recordAttempt({
        experimentId: experiment.id,
        modelKey,
        attempt: round,
        status: optimizationAttemptFailureStatus(error),
        error: redactOptimizationError(error),
      });
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
    const routes = experiment.modelConfig as Array<{ provider: string; model: string }>;
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
        await this.processRound(experiment, baseline, descriptors, route, round);
        if (await this.cancelled(experiment.id)) return;
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
    const baseline = await this.formalStrategyVersion(experiment.baselineStrategyVersionId);
    experiment = await this.ensureBaselines(experiment);
    await this.setStage(id, 'proposing');
    await this.processModelRounds(experiment, baseline);
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
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='failed', "stage"='failed', "leaseUntil"=NULL, "stopReason"=${reason}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "status" <> 'cancelled'
    `).catch(() => undefined);
  }

  private async resumePending() {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "OptimizationExperiment"
      WHERE "status" IN ('queued','running') AND "cancelRequestedAt" IS NULL
        AND ("status"='queued' OR "leaseUntil" IS NULL OR "leaseUntil" < CURRENT_TIMESTAMP)
      ORDER BY "createdAt" ASC LIMIT 10
    `);
    rows.forEach((row) => void this.process(row.id).catch(() => undefined));
  }

  private async eligibleFinalCandidates(id: string, candidateIds: string[]) {
    const all = await this.candidates(id);
    const selected = all.filter((candidate) => candidateIds.includes(candidate.id));
    if (selected.length !== candidateIds.length)
      throw new BadRequestException('锁定候选不属于当前实验');
    if (
      selected.some(
        (candidate) => !['valid', 'test_valid', 'test_invalid'].includes(candidate.validationStatus),
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
    if (JSON.stringify(requested) !== JSON.stringify(locked) || experiment.selectedCandidateId !== selectedCandidateId)
      throw new BadRequestException('测试集已开始访问，只允许对原锁定候选进行技术重试');
  }

  private async lockFinalization(
    experiment: ExperimentRow,
    candidateIds: string[],
    selectedCandidateId: string,
  ) {
    this.assertSameFinalizationLock(experiment, candidateIds, selectedCandidateId);
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='testing', "stage"='testing', "lockedCandidateIds"=${JSON.stringify(candidateIds)}::jsonb,
          "selectedCandidateId"=${selectedCandidateId}::uuid, "leaseUntil"=${new Date(Date.now() + 3_600_000)},
          "pausedDurationMs"="pausedDurationMs" + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "updatedAt")) * 1000))::int,
          "testExposedAt"=COALESCE("testExposedAt", CURRENT_TIMESTAMP),
          "exposure"=COALESCE("exposure", '{}'::jsonb) || ${JSON.stringify({ testAccessStarted: true, lockedCandidateIds: candidateIds, preselectedCandidateId: selectedCandidateId })}::jsonb,
          "stopReason"=NULL, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${experiment.id}::uuid AND "stage"='awaiting_finalization' AND "cancelRequestedAt" IS NULL
    `);
    if (updated !== 1) throw new BadRequestException('实验封存状态发生并发变化');
  }

  private async finalBaseline(experiment: ExperimentRow) {
    const existingFingerprint = toRecord(experiment.frozenDataFingerprints).test;
    const existingRunId = toRecord(experiment.baselineRunRefs).test;
    if (typeof existingFingerprint === 'string' && typeof existingRunId === 'string')
      return existingFingerprint;
    const run = await this.runs.executeRun(
      experiment,
      experiment.baselineStrategyVersionId,
      'test',
      'baseline-final',
    );
    const summary = this.runs.evaluateResult(run, experiment.objective);
    const fingerprint = this.runs.dataArtifactFingerprint(run);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "baselineRunRefs"=COALESCE("baselineRunRefs", '{}'::jsonb) || ${JSON.stringify({ test: run.id })}::jsonb,
          "baselineMetrics"=COALESCE("baselineMetrics", '{}'::jsonb) || ${JSON.stringify({ test: summary })}::jsonb,
          "frozenDataFingerprints"=COALESCE("frozenDataFingerprints", '{}'::jsonb) || ${JSON.stringify({ test: fingerprint })}::jsonb
      WHERE "id"=${experiment.id}::uuid
    `);
    return fingerprint;
  }

  private async finalCandidate(experiment: ExperimentRow, candidate: CandidateRow, fingerprint: string) {
    const existingRunId = toRecord(candidate.runRefs).test;
    if (
      typeof existingRunId === 'string' &&
      ['test_valid', 'test_invalid'].includes(candidate.validationStatus)
    )
      return;
    const run = await this.runs.executeRun(
      experiment,
      candidate.candidateStrategyVersionId,
      'test',
      `candidate-final:${candidate.id}`,
    );
    const sameData = this.runs.dataArtifactFingerprint(run) === fingerprint;
    const summary = sameData
      ? this.runs.evaluateResult(run, experiment.objective)
      : { runId: run.id, status: 'invalid' as const, completeness: 'unavailable', tradeCount: 0, reason: '封存测试候选与基准数据 Artifact 指纹不一致' };
    const runRefs = { ...toRecord(candidate.runRefs), test: run.id };
    const metrics = { ...toRecord(candidate.metrics), test: summary };
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate" SET "runRefs"=${JSON.stringify(runRefs)}::jsonb,
        "metrics"=${JSON.stringify(metrics)}::jsonb,
        "validationStatus"=${summary.status === 'valid' ? 'test_valid' : 'test_invalid'}
      WHERE "id"=${candidate.id}::uuid
    `);
  }

  private async completeFinalization(id: string, candidateIds: string[], selectedCandidateId: string) {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='succeeded', "stage"='completed', "testExposedAt"=COALESCE("testExposedAt", CURRENT_TIMESTAMP),
          "exposure"=COALESCE("exposure", '{}'::jsonb) || ${JSON.stringify({ testRevealed: true, lockedCandidateIds: candidateIds, preselectedCandidateId: selectedCandidateId })}::jsonb,
          "leaseUntil"=NULL, "stopReason"=NULL, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid
    `);
  }

  private async releaseFinalizationForRetry(id: string, error: unknown) {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='awaiting_finalization', "stage"='awaiting_finalization', "leaseUntil"=NULL,
          "stopReason"=${`final_test_retry_required:${redactOptimizationError(error)}`},
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "status"='testing'
    `);
  }

  async finalize(id: string, input: unknown) {
    this.assertEnabled();
    const parsed = optimizationFinalizeSchema.parse(input);
    const experiment = await this.experiment(id);
    if (experiment.stage !== parsed.expectedStage || experiment.status !== 'awaiting_finalization')
      throw new BadRequestException('实验当前不能进入最终测试');
    const candidates = await this.eligibleFinalCandidates(id, parsed.candidateIds);
    await this.lockFinalization(experiment, parsed.candidateIds, parsed.selectedCandidateId);
    try {
      const testingExperiment = await this.experiment(id);
      const fingerprint = await this.finalBaseline(testingExperiment);
      for (const candidate of candidates)
        await this.finalCandidate(testingExperiment, candidate, fingerprint);
      await this.completeFinalization(id, parsed.candidateIds, parsed.selectedCandidateId);
      return this.compare(id);
    } catch (error) {
      await this.releaseFinalizationForRetry(id, error);
      throw error;
    }
  }

  private async previousAdoption(idempotencyKey: string) {
    const rows = await this.prisma.$queryRaw<Array<{ formalStrategyVersionId: string }>>(Prisma.sql`
      SELECT "formalStrategyVersionId" FROM "OptimizationAdoption" WHERE "idempotencyKey"=${idempotencyKey} LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async adoptableCandidate(id: string, candidateId: string) {
    const rows = await this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationCandidate" WHERE "experimentId"=${id}::uuid AND "id"=${candidateId}::uuid LIMIT 1
    `);
    const candidate = rows[0];
    if (!candidate) throw new NotFoundException('候选不存在');
    if (candidate.validationStatus !== 'test_valid')
      throw new BadRequestException('只有封存测试通过的候选可以采纳');
    return candidate;
  }

  private async formalizeCandidate(
    experimentId: string,
    candidate: CandidateRow,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    const candidateVersion = await this.prisma.strategyVersion.findUnique({
      where: { id: candidate.candidateStrategyVersionId },
    });
    if (!candidateVersion) throw new NotFoundException('候选策略版本不存在');
    const latest = await this.prisma.strategyVersion.aggregate({
      where: { strategyId: candidateVersion.strategyId, version: { gt: 0 } },
      _max: { version: true },
    });
    if ((latest._max.version ?? 0) !== expectedVersion)
      throw new BadRequestException('正式策略已经发布新版本，请重新确认采纳');
    return this.prisma.$transaction(async (transaction) => {
      const formal = await transaction.strategyVersion.create({
        data: {
          strategyId: candidateVersion.strategyId,
          version: expectedVersion + 1,
          schemaVersion: 2,
          schema: candidateVersion.schema as Prisma.InputJsonValue,
        },
      });
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "OptimizationAdoption" ("experimentId", "candidateId", "idempotencyKey", "candidateHash", "formalStrategyVersionId")
        VALUES (${experimentId}::uuid, ${candidate.id}::uuid, ${idempotencyKey}, ${candidate.executionHash}, ${formal.id}::uuid)
      `);
      await transaction.$executeRaw(Prisma.sql`
        UPDATE "OptimizationCandidate" SET "adoptedStrategyVersionId"=${formal.id}::uuid WHERE "id"=${candidate.id}::uuid
      `);
      return formal;
    });
  }

  async adopt(id: string, input: unknown) {
    this.assertEnabled();
    const parsed = optimizationAdoptSchema.parse(input);
    const previous = await this.previousAdoption(parsed.idempotencyKey);
    if (previous) {
      const formal = await this.prisma.strategyVersion.findUnique({ where: { id: previous.formalStrategyVersionId } });
      return { strategyVersion: formal, monitoringPlan: formal ? await this.riskApplications.monitoringPlan(formal.id) : null };
    }
    const experiment = await this.experiment(id);
    if (experiment.status !== 'succeeded' || experiment.stage !== 'completed')
      throw new BadRequestException('实验尚未完成封存测试');
    if (experiment.testExposedAt && parsed.candidateId !== experiment.selectedCandidateId && !parsed.acknowledgeTestExposure)
      throw new BadRequestException('测试集已经揭示；改选其他候选需要明确确认测试暴露');
    const candidate = await this.adoptableCandidate(id, parsed.candidateId);
    if (candidate.executionHash !== parsed.candidateHash)
      throw new BadRequestException('候选执行哈希已变化，必须重新验证');
    const formal = await this.formalizeCandidate(
      id,
      candidate,
      parsed.expectedStrategyVersion,
      parsed.idempotencyKey,
    );
    const [monitoringPlan, baselinePlan] = await Promise.all([
      this.riskApplications.monitoringPlan(formal.id),
      this.riskApplications.monitoringPlan(experiment.baselineStrategyVersionId),
    ]);
    return {
      strategyVersion: formal,
      source: { experimentId: id, candidateId: candidate.id, candidateHash: candidate.executionHash },
      monitoringPlan,
      monitoringDiff: { before: baselinePlan, after: monitoringPlan },
      riskApplicationEnabled: false,
    };
  }
}
