import { Prisma } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import type { StrategyOptimizationRunService } from './strategy-optimization-run.service.js';
import {
  redactOptimizationError,
  toRecord,
  type CandidateRow,
  type EvaluationSummary,
  type ExperimentRow,
} from './strategy-optimization-common.js';
import { OptimizationBacktestFailure } from './strategy-optimization-failure.js';

/** 切分完成即保存；模型请求事实与候选回测终态分别维护。 */
export async function evaluateOptimizationCandidate(
  prisma: PrismaService,
  runs: Pick<StrategyOptimizationRunService, 'evaluateCandidateSplit'>,
  experiment: ExperimentRow,
  candidate: CandidateRow,
) {
  const fingerprints = toRecord(experiment.frozenDataFingerprints);
  const runRefs = { ...toRecord(candidate.runRefs) };
  const metrics = { ...toRecord(candidate.metrics) };
  const persist = async (validationStatus: string) => {
    const updated = await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "runRefs"=${JSON.stringify(runRefs)}::jsonb, "metrics"=${JSON.stringify(metrics)}::jsonb,
          "validationStatus"=${validationStatus}
      WHERE "id"=${candidate.id}::uuid AND "validationStatus"='evaluating'
        AND EXISTS (SELECT 1 FROM "OptimizationExperiment" AS e
          WHERE e."id"=${experiment.id}::uuid AND e."status"='running'
            AND e."executionAttempt"=${experiment.executionAttempt} AND e."cancelRequestedAt" IS NULL)
    `);
    if (updated !== 1) throw new Error('候选评估状态已变化，停止提交过期结果');
    return { ...candidate, runRefs, metrics, validationStatus };
  };
  for (const split of ['development', 'validation'] as const) {
    let evaluation;
    try {
      evaluation = await runs.evaluateCandidateSplit(
        experiment,
        candidate.candidateStrategyVersionId,
        candidate.id,
        split,
        fingerprints[split],
      );
    } catch (error) {
      const reason = redactOptimizationError(error);
      const failure =
        error instanceof OptimizationBacktestFailure
          ? error
          : new OptimizationBacktestFailure('CANDIDATE_EVALUATION_FAILED', reason);
      if (failure.runId) runRefs[split] = failure.runId;
      metrics[split] = {
        ...(failure.runId ? { runId: failure.runId } : {}),
        status: 'invalid',
        completeness: 'unavailable',
        tradeCount: 0,
        ...(failure.code === 'DATA_UNAVAILABLE'
          ? { failureCategory: 'data-unavailable' as const }
          : {}),
        reason,
      } satisfies Omit<EvaluationSummary, 'runId'> & { runId?: string };
      await persist('invalid');
      throw failure;
    }
    runRefs[split] = evaluation.run.id;
    metrics[split] = evaluation.summary;
    if (split === 'development') await persist('evaluating');
  }
  const valid =
    toRecord(metrics.development).status === 'valid' &&
    toRecord(metrics.validation).status === 'valid';
  return persist(valid ? 'valid' : 'invalid');
}
