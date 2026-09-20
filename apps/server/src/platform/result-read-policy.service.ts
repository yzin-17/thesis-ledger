import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  resultReadEligibilityForExperiment,
  resultReadEligibilityForRun,
  type ResultReadEligibility,
} from '@thesis-ledger/schemas';
import { PrismaService } from './prisma.service.js';

type RunAssociation = {
  runId: string;
  optimizationProvenance: boolean;
  hasAssociation: boolean;
  split: string | null;
  testExposedAt: Date | null;
  exposure: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const withoutTestSplit = (value: unknown) => {
  const record = asRecord(value);
  const { test: _test, ...visible } = record;
  return visible;
};

/**
 * 统一封存结果读取边界。此服务只读取授权事实，不推进实验状态、不记录访问、也不重试任务。
 * Backtest 通过此稳定平台边界消费授权，避免反向依赖 strategy-optimization 编排层。
 */
@Injectable()
export class ResultReadPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  experiment(input: { exposure?: unknown; testExposedAt?: unknown }) {
    return resultReadEligibilityForExperiment(input);
  }

  async runs(runIds: readonly string[]) {
    const ids = [...new Set(runIds)].filter((id) => id.length > 0);
    if (ids.length === 0) return new Map<string, ResultReadEligibility>();
    const rows = await this.prisma.$queryRaw<RunAssociation[]>(Prisma.sql`
      WITH provenance AS (
        SELECT b."id" AS "runId",
               (
                 COALESCE(b."idempotencyKey", '') LIKE 'optimization:%'
                 OR sv."version" <= 0
                 OR sv."schemaVersion" <= 0
                 OR s."status" = 'experiment-only'
               ) AS "optimizationProvenance"
        FROM "BacktestJob" AS b
        JOIN "StrategyVersion" AS sv ON sv."id"=b."strategyVersionId"
        JOIN "Strategy" AS s ON s."id"=sv."strategyId"
        WHERE b."id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      ),
      associations AS (
        SELECT refs."value" AS "runId", refs."key" AS "split",
               e."testExposedAt", e."exposure"
        FROM "OptimizationExperiment" AS e
        CROSS JOIN LATERAL jsonb_each_text(COALESCE(e."baselineRunRefs", '{}'::jsonb)) AS refs
        WHERE e."ownerKey"='local-user' AND refs."value" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::text`))})
        UNION ALL
        SELECT refs."value" AS "runId", refs."key" AS "split",
               e."testExposedAt", e."exposure"
        FROM "OptimizationCandidate" AS c
        JOIN "OptimizationExperiment" AS e ON e."id"=c."experimentId"
        CROSS JOIN LATERAL jsonb_each_text(COALESCE(c."runRefs", '{}'::jsonb)) AS refs
        WHERE e."ownerKey"='local-user' AND refs."value" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::text`))})
      )
      SELECT p."runId", p."optimizationProvenance",
             (a."runId" IS NOT NULL) AS "hasAssociation",
             a."split", a."testExposedAt", a."exposure"
      FROM provenance AS p
      LEFT JOIN associations AS a ON a."runId"=p."runId"::text
    `);
    const result = new Map<string, ResultReadEligibility>();
    for (const row of rows) {
      const next = resultReadEligibilityForRun({
        associated: row.hasAssociation,
        ordinaryFormal: !row.optimizationProvenance,
        split: row.split,
        exposure: row.exposure,
        testExposedAt: row.testExposedAt,
      });
      const previous = result.get(row.runId);
      if (!previous || (previous.state === 'readable' && next.state === 'restricted')) {
        result.set(row.runId, next);
      }
    }
    return result;
  }

  async run(runId: string) {
    const result = await this.runs([runId]);
    return (
      result.get(runId) ??
      resultReadEligibilityForRun({ associated: false, ordinaryFormal: false, split: null })
    );
  }

  async protectBacktestJobs<T extends { id: string }>(
    jobs: readonly T[],
  ): Promise<Array<T & { readEligibility: ResultReadEligibility }>> {
    const eligibilityByRun = await this.runs(jobs.map((job) => job.id));
    return jobs.map((job) => this.protectBacktestJob(job, eligibilityByRun.get(job.id)));
  }

  protectBacktestJob<T extends { id: string }>(
    job: T,
    known?: ResultReadEligibility,
  ): T & { readEligibility: ResultReadEligibility } {
    const readEligibility = known ?? resultReadEligibilityForRun({ associated: false });
    if (readEligibility.state === 'readable') return { ...job, readEligibility };
    const {
      result: _result,
      resultChecksum: _resultChecksum,
      snapshotId: _snapshotId,
      snapshotManifest: _snapshotManifest,
      diagnostics: _diagnostics,
      ...redacted
    } = job as T & Record<string, unknown>;
    return { ...redacted, readEligibility } as T & { readEligibility: ResultReadEligibility };
  }

  protectExperiment<T extends { exposure?: unknown; testExposedAt?: unknown }>(
    experiment: T,
  ): T & { readEligibility: ResultReadEligibility } {
    const readEligibility = this.experiment(experiment);
    if (readEligibility.state === 'readable') return { ...experiment, readEligibility };
    const {
      baselineRunRefs,
      baselineMetrics,
      selectedCandidateId: _selectedCandidateId,
      ...visible
    } = experiment as T & Record<string, unknown>;
    return {
      ...visible,
      baselineRunRefs: withoutTestSplit(baselineRunRefs),
      baselineMetrics: withoutTestSplit(baselineMetrics),
      selectedCandidateId: null,
      readEligibility,
    } as T & { readEligibility: ResultReadEligibility };
  }

  protectCandidate<T extends { runRefs?: unknown; metrics?: unknown; validationStatus?: string }>(
    candidate: T,
    readEligibility: ResultReadEligibility,
  ): T & { readEligibility: ResultReadEligibility } {
    if (readEligibility.state === 'readable') return { ...candidate, readEligibility };
    const { runRefs, metrics, validationStatus, ...visible } = candidate;
    return {
      ...visible,
      runRefs: withoutTestSplit(runRefs),
      metrics: withoutTestSplit(metrics),
      validationStatus: validationStatus ? 'restricted' : validationStatus,
      readEligibility,
    } as T & { readEligibility: ResultReadEligibility };
  }
}
