import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { optimizationFinalizeSchema } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import type { StrategyOptimizationRunService } from './strategy-optimization-run.service.js';
import type { StrategyOptimizationReadService } from './strategy-optimization-read.service.js';
import { invalidOptimizationComparison } from './strategy-optimization-evaluation.js';
import {
  toRecord,
  redactOptimizationError,
  type CandidateRow,
  type ExperimentRow,
} from './strategy-optimization-common.js';

/** 封存批次的领取、执行、恢复和统一揭示；不生成模型候选或正式策略。 */
export class OptimizationFinalization {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: StrategyOptimizationRunService,
    private readonly reads: StrategyOptimizationReadService,
    private readonly active: Set<string>,
  ) {}

  private async experiment(id: string) {
    const rows = await this.prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "id"=${id}::uuid AND "ownerKey"='local-user' LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('优化实验不存在');
    return rows[0];
  }

  private candidates(id: string) {
    return this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationCandidate" WHERE "experimentId"=${id}::uuid ORDER BY "candidateNumber" ASC
    `);
  }

  async complete(id: string) {
    const experiment = await this.experiment(id);
    if (experiment.status === 'testing' || experiment.status === 'succeeded')
      return this.reads.compare(id);
    if (
      experiment.stage !== 'awaiting_finalization' ||
      experiment.status !== 'awaiting_finalization' ||
      experiment.cancelRequestedAt !== null
    )
      throw new BadRequestException('实验当前不能继续封存测试');
    const locked = this.lockedCandidateIds(experiment);
    const candidateIds = locked.length
      ? locked
      : (await this.candidates(id))
          .filter((candidate) => candidate.validationStatus === 'valid')
          .map((candidate) => candidate.id);
    if (candidateIds.length === 0) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "OptimizationExperiment" SET "status"='failed', "stage"='failed',
          "stopReason"='no_valid_candidate', "leaseUntil"=NULL, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${id}::uuid AND "status"='awaiting_finalization' AND "cancelRequestedAt" IS NULL
      `);
      return this.reads.compare(id);
    }
    await this.eligibleFinalCandidates(id, candidateIds);
    const selected = locked.length ? experiment.selectedCandidateId : null;
    const attempt = await this.lockFinalization(experiment, candidateIds, selected);
    try {
      return await this.runFinalization(id, attempt);
    } catch (error) {
      await this.releaseFinalizationForRetry(id, attempt, error);
      throw error;
    }
  }

  async resumeAutomatic(id: string) {
    if (this.active.has(id)) return;
    this.active.add(id);
    try {
      const experiment = await this.experiment(id);
      if (
        experiment.status === 'awaiting_finalization' &&
        experiment.stopReason === null &&
        this.lockedCandidateIds(experiment).length === 0
      )
        await this.complete(id);
    } finally {
      this.active.delete(id);
    }
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
    selectedCandidateId: string | null,
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
    selectedCandidateId: string | null,
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
      const actual = this.runs.evaluateResult(run, experiment.objective);
      const summary = sameData ? actual : invalidOptimizationComparison(actual,
        '封存测试候选与基准数据 Artifact 指纹不一致');
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
    selectedCandidateId: string | null,
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
    if (lockedIds.length === 0) throw new Error('封存测试缺少原子锁定的候选集合');
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

  async resumeTesting(id: string) {
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
}
