import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  optimizationDiscoveryScopeSchema,
  resultReadEligibilityForExperiment,
  strategySchemaV2,
  type StrategySchemaV2,
  type OptimizationExperimentSource,
  type OptimizationCandidateSource,
} from '@thesis-ledger/schemas';
import { AiProviderRegistry } from '../ai/provider-registry.js';
import {
  backtestJobSummarySelect,
  toBacktestJobSummary,
  type BacktestJobSummary,
} from '../backtest/backtest-summary.js';
import { PrismaService } from '../platform/prisma.service.js';
import { ResultReadPolicyService } from '../platform/result-read-policy.service.js';
import {
  experimentDisplayName,
  toRecord,
  type AttemptRow,
  type CandidateRow,
  type EnrichedCandidate,
  type EnrichedExperiment,
  type ExperimentReadRow,
} from './strategy-optimization-common.js';
import { describeStrategyParameters } from './strategy-optimization-parameters.js';
import { optimizationCostFacts, optimizationCostSummary } from './strategy-optimization-cost.js';
import {
  enrichOptimizationExperiment,
  optimizationAttemptReadModel,
  optimizationUsageNote,
} from './strategy-optimization-read-model.js';

export type ExperimentListInput = {
  limit?: number | undefined;
  cursor?: string | undefined;
  jobId?: string | undefined;
  search?: string | undefined;
  sourceMode?: 'existing' | 'discovery' | undefined;
  status?: string | undefined;
  strategyVersionId?: string | undefined;
};

export type ExperimentPage = {
  items: EnrichedExperiment[];
  totalCount: number;
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
};

type BacktestAssociationRow = {
  runId: string;
  experimentId: string;
  baselineStrategyVersionId: string;
  experimentName: string | null;
  sourceMode: 'existing' | 'discovery';
  discoveryScope: unknown;
  strategySpaceVersion: string | null;
  experimentStage: string;
  relation: 'baseline' | 'candidate';
  split: string;
  candidateId: string | null;
  candidateNumber: number | null;
  candidateStrategyVersionId: string | null;
  strategyId: string | null;
  strategyName: string | null;
  strategyVersion: number | null;
  strategySchemaVersion: number | null;
};

type BacktestStrategyVersionSource = {
  id: string;
  version: number;
  schemaVersion: number;
  strategy: { id: string; name: string };
};

export type BacktestGroupItem = {
  id: string;
  kind: 'user' | 'experiment';
  name: string;
  experimentId: string | null;
  experimentStage: string | null;
  source: OptimizationExperimentSource | null;
  jobs: BacktestJobSummary[];
  members: BacktestGroupMember[];
};

export type BacktestGroupMember = {
  jobId: string;
  relation: 'user' | 'baseline' | 'candidate';
  split: string | null;
  candidateSource: OptimizationCandidateSource | null;
};

export type BacktestGroupPage = {
  items: BacktestGroupItem[];
  totalCount: number;
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
};

const encodeCursor = (createdAt: Date, id: string) =>
  Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64url');

const decodeCursor = (cursor?: string) => {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof value.createdAt !== 'string' || typeof value.id !== 'string') return null;
    const createdAt = new Date(value.createdAt);
    if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/iu.test(value.id)) return null;
    return { createdAt, id: value.id };
  } catch {
    return null;
  }
};

const experimentSelect = (tail: Prisma.Sql) => Prisma.sql`
  SELECT e.*, s."id" AS "strategyId", s."name" AS "strategyName",
         v."version" AS "strategyVersion", v."schemaVersion" AS "strategySchemaVersion",
         v."schema" AS "baselineStrategySchema"
  FROM "OptimizationExperiment" AS e
  LEFT JOIN "StrategyVersion" AS v ON v."id"=e."baselineStrategyVersionId"
  LEFT JOIN "Strategy" AS s ON s."id"=v."strategyId"
  ${tail}
`;

const sourceForAssociation = (row: BacktestAssociationRow): OptimizationExperimentSource => {
  if (row.sourceMode === 'existing') {
    if (
      row.strategyId &&
      row.strategyVersion !== null &&
      row.strategyVersion > 0 &&
      row.strategySchemaVersion !== null &&
      row.strategySchemaVersion > 0
    ) {
      return {
        kind: 'existing',
        strategyId: row.strategyId,
        strategyVersionId: row.baselineStrategyVersionId,
        strategyName: row.strategyName?.trim() || null,
        version: row.strategyVersion,
        schemaVersion: row.strategySchemaVersion,
      };
    }
    return { kind: 'unknown', reason: 'missing_baseline', referenceId: row.experimentId };
  }
  const scope = optimizationDiscoveryScopeSchema.safeParse(row.discoveryScope);
  return {
    kind: 'discovery',
    experimentId: row.experimentId,
    strategySpaceVersion: row.strategySpaceVersion?.trim() || null,
    discoveryScope: scope.success ? scope.data : null,
  };
};

@Injectable()
export class StrategyOptimizationReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AiProviderRegistry,
    private readonly resultReadPolicy: ResultReadPolicyService,
  ) {
    if (!resultReadPolicy) throw new Error('ResultReadPolicyService is required');
  }

  async formalStrategyVersion(id: string) {
    const version = await this.prisma.strategyVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('策略版本不存在');
    if (version.schemaVersion !== 2 || version.version <= 0)
      throw new BadRequestException('AI 优化只能从正式 V2 策略版本开始');
    return { ...version, strategy: strategySchemaV2.parse(version.schema) as StrategySchemaV2 };
  }

  capabilities() {
    return {
      riskApplicationsEnabled: process.env.STRATEGY_RISK_APPLICATIONS_ENABLED !== 'false',
      aiOptimizationEnabled: process.env.STRATEGY_AI_OPTIMIZATION_ENABLED !== 'false',
      providers: this.providers.list().flatMap((provider) => {
        const costFacts = optimizationCostFacts(provider.metadata);
        return provider.models.map((model) => ({
          provider: provider.id,
          model,
          ...costFacts,
          ...(provider.metadata?.modelReasoning?.[model]
            ? {
                reasoning: {
                  ...(provider.metadata.modelReasoning[model].supportedEfforts === undefined
                    ? {}
                    : {
                        supportedEfforts: provider.metadata.modelReasoning[model].supportedEfforts,
                      }),
                  ...(provider.metadata.modelReasoning[model].defaultEffort === undefined
                    ? {}
                    : { defaultEffort: provider.metadata.modelReasoning[model].defaultEffort }),
                  ...(provider.metadata.modelReasoning[model].mandatory === undefined
                    ? {}
                    : { mandatory: provider.metadata.modelReasoning[model].mandatory }),
                },
              }
            : {}),
        }));
      }),
    };
  }

  async parameters(strategyVersionId: string) {
    const version = await this.prisma.strategyVersion.findUnique({
      where: { id: strategyVersionId },
    });
    if (!version) throw new NotFoundException('策略版本不存在');
    if (version.schemaVersion !== 2 || version.version <= 0)
      throw new BadRequestException('只有正式 V2 策略版本可以配置优化参数');
    return describeStrategyParameters(strategySchemaV2.parse(version.schema) as StrategySchemaV2);
  }

  async experiment(id: string) {
    const rows = await this.prisma.$queryRaw<ExperimentReadRow[]>(
      experimentSelect(Prisma.sql`
      WHERE e."id"=${id}::uuid AND e."ownerKey"='local-user'
    `),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('优化实验不存在');
    const enriched = enrichOptimizationExperiment(row);
    return this.resultReadPolicy.protectExperiment(enriched);
  }

  async candidates(id: string): Promise<EnrichedCandidate[]> {
    const rows = await this.prisma.$queryRaw<
      (CandidateRow & {
        experimentStage: string;
        experimentExposure: unknown;
        experimentTestExposedAt: Date | null;
      })[]
    >(Prisma.sql`
      SELECT c.*, e."stage" AS "experimentStage", e."exposure" AS "experimentExposure",
             e."testExposedAt" AS "experimentTestExposedAt"
      FROM "OptimizationCandidate" AS c
      JOIN "OptimizationExperiment" AS e ON e."id"=c."experimentId"
      WHERE c."experimentId"=${id}::uuid AND e."ownerKey"='local-user'
      ORDER BY c."candidateNumber" ASC, c."id" ASC
    `);
    return rows.map(
      ({ experimentStage, experimentExposure, experimentTestExposedAt, ...candidate }) => {
        const readEligibility = resultReadEligibilityForExperiment({
          exposure: experimentExposure,
          testExposedAt: experimentTestExposedAt,
        });
        const enriched = {
          ...candidate,
          source: {
            kind: 'candidate' as const,
            experimentId: candidate.experimentId,
            candidateId: candidate.id,
            candidateStrategyVersionId: candidate.candidateStrategyVersionId,
            candidateNumber: candidate.candidateNumber,
            stage: experimentStage,
          },
          readEligibility,
        };
        return this.resultReadPolicy.protectCandidate(enriched, readEligibility);
      },
    );
  }

  attempts(id: string) {
    return this.prisma.$queryRaw<AttemptRow[]>(Prisma.sql`
      SELECT attempt.*,
             ai."inputTokens" AS "inputTokens",
             ai."outputTokens" AS "outputTokens",
             ai."cost" AS "cost",
             ai."durationMs" AS "durationMs",
             ai."modelMetadata" AS "modelMetadata"
      FROM "OptimizationAttempt" AS attempt
      LEFT JOIN "AiRun" AS ai ON ai."id"=attempt."aiRunId"
      WHERE attempt."experimentId"=${id}::uuid
      ORDER BY attempt."createdAt" ASC, attempt."id" ASC
    `);
  }

  async get(id: string) {
    const experiment = await this.experiment(id);
    const [candidates, attempts] = await Promise.all([this.candidates(id), this.attempts(id)]);
    const costSummary = optimizationCostSummary(experiment, attempts);
    const safeAttempts = attempts.map(optimizationAttemptReadModel);
    return {
      experiment: {
        ...experiment,
        costUsed: costSummary.status === 'complete' ? experiment.costUsed : null,
        costSummary,
      },
      candidates,
      attempts: safeAttempts,
    };
  }

  async list(input: ExperimentListInput | number = {}) {
    const parsed = typeof input === 'number' ? { limit: input } : input;
    const bounded = Math.max(1, Math.min(parsed.limit ?? 30, 100));
    const cursor = decodeCursor(parsed.cursor);
    if (parsed.cursor && !cursor) throw new BadRequestException('优化实验游标无效');
    const filters = [Prisma.sql`e."ownerKey"='local-user'`];
    if (parsed.search) {
      const needle = `%${parsed.search}%`;
      filters.push(Prisma.sql`(
        COALESCE(e."name", '') ILIKE ${needle}
        OR COALESCE(s."name", '') ILIKE ${needle}
        OR e."id"::text ILIKE ${needle}
        OR COALESCE(e."discoveryScope"::text, '') ILIKE ${needle}
      )`);
    }
    if (parsed.sourceMode) filters.push(Prisma.sql`e."sourceMode"=${parsed.sourceMode}`);
    if (parsed.status) filters.push(Prisma.sql`e."status"=${parsed.status}`);
    if (parsed.strategyVersionId)
      filters.push(Prisma.sql`e."baselineStrategyVersionId"=${parsed.strategyVersionId}::uuid`);
    if (cursor)
      filters.push(
        Prisma.sql`(e."createdAt", e."id") < (${cursor.createdAt}::timestamp, ${cursor.id}::uuid)`,
      );
    const where = Prisma.join(filters, ' AND ');
    const [rows, totalRows] = await Promise.all([
      this.prisma.$queryRaw<ExperimentReadRow[]>(
        experimentSelect(Prisma.sql`
        WHERE ${where}
        ORDER BY e."createdAt" DESC, e."id" DESC
        LIMIT ${bounded + 1}
      `),
      ),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "OptimizationExperiment" AS e
        LEFT JOIN "StrategyVersion" AS v ON v."id"=e."baselineStrategyVersionId"
        LEFT JOIN "Strategy" AS s ON s."id"=v."strategyId"
        WHERE ${Prisma.join(
          filters.filter((_, index) => index < filters.length - (cursor ? 1 : 0)),
          ' AND ',
        )}
      `),
    ]);
    const hasNextPage = rows.length > bounded;
    const items = (hasNextPage ? rows.slice(0, bounded) : rows).map((row) => {
      const enriched = enrichOptimizationExperiment(row);
      return this.resultReadPolicy.protectExperiment(enriched);
    });
    const tail = items.at(-1);
    return {
      items,
      totalCount: Number(totalRows[0]?.count ?? 0n),
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage && tail ? encodeCursor(tail.createdAt, tail.id) : null,
      },
    } satisfies ExperimentPage;
  }

  async listBacktestGroups(input: ExperimentListInput = {}): Promise<BacktestGroupPage> {
    const bounded = Math.max(1, Math.min(input.limit ?? 50, 100));
    const cursor = decodeCursor(input.cursor);
    if (input.cursor && !cursor) throw new BadRequestException('回测分组游标无效');
    const jobs = await this.prisma.backtestJob.findMany({
      where: {
        ...(input.jobId ? { id: input.jobId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.strategyVersionId ? { strategyVersionId: input.strategyVersionId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: backtestJobSummarySelect,
    });
    const [associations, strategyVersions] = await Promise.all([
      this.prisma.$queryRaw<BacktestAssociationRow[]>(Prisma.sql`
      SELECT refs."value" AS "runId", e."id" AS "experimentId", e."name" AS "experimentName",
             e."sourceMode", e."discoveryScope", e."strategySpaceVersion", e."baselineStrategyVersionId",
             e."stage" AS "experimentStage", 'baseline' AS "relation", refs."key" AS "split",
             NULL::uuid AS "candidateId", NULL::integer AS "candidateNumber", NULL::uuid AS "candidateStrategyVersionId",
             s."id" AS "strategyId", s."name" AS "strategyName",
             v."version" AS "strategyVersion", v."schemaVersion" AS "strategySchemaVersion"
      FROM "OptimizationExperiment" AS e
      LEFT JOIN "StrategyVersion" AS v ON v."id"=e."baselineStrategyVersionId"
      LEFT JOIN "Strategy" AS s ON s."id"=v."strategyId"
      CROSS JOIN LATERAL jsonb_each_text(COALESCE(e."baselineRunRefs", '{}'::jsonb)) AS refs
      WHERE e."ownerKey"='local-user'
      UNION ALL
      SELECT refs."value" AS "runId", e."id" AS "experimentId", e."name" AS "experimentName",
             e."sourceMode", e."discoveryScope", e."strategySpaceVersion", e."baselineStrategyVersionId",
             e."stage" AS "experimentStage", 'candidate' AS "relation", refs."key" AS "split",
             c."id" AS "candidateId", c."candidateNumber", c."candidateStrategyVersionId",
             s."id" AS "strategyId", s."name" AS "strategyName",
             v."version" AS "strategyVersion", v."schemaVersion" AS "strategySchemaVersion"
      FROM "OptimizationCandidate" AS c
      JOIN "OptimizationExperiment" AS e ON e."id"=c."experimentId"
      LEFT JOIN "StrategyVersion" AS v ON v."id"=e."baselineStrategyVersionId"
      LEFT JOIN "Strategy" AS s ON s."id"=v."strategyId"
      CROSS JOIN LATERAL jsonb_each_text(COALESCE(c."runRefs", '{}'::jsonb)) AS refs
      WHERE e."ownerKey"='local-user'
      ORDER BY "runId" ASC, "experimentId" ASC, "relation" ASC, "split" ASC
    `),
      this.prisma.strategyVersion.findMany({
        where: { id: { in: [...new Set(jobs.map((job) => job.strategyVersionId))] } },
        select: {
          id: true,
          version: true,
          schemaVersion: true,
          strategy: { select: { id: true, name: true } },
        },
      }),
    ]);
    const strategyVersionById = new Map(
      (strategyVersions as BacktestStrategyVersionSource[]).map((version) => [version.id, version]),
    );
    const summaries = jobs.map(toBacktestJobSummary);
    const protectedSummaries = await this.resultReadPolicy.protectBacktestJobs(summaries);
    const summaryByRunId = new Map(protectedSummaries.map((summary) => [summary.id, summary]));
    const associationByRunId = new Map<string, BacktestAssociationRow>();
    for (const association of associations) {
      if (summaryByRunId.has(association.runId) && !associationByRunId.has(association.runId))
        associationByRunId.set(association.runId, association);
    }
    const groups = new Map<string, BacktestGroupItem>();
    for (const job of jobs) {
      const summary = summaryByRunId.get(job.id)!;
      const association = associationByRunId.get(job.id);
      if (!association) {
        const strategyVersion = strategyVersionById.get(job.strategyVersionId);
        groups.set(job.id, {
          id: job.id,
          kind: 'user',
          name: strategyVersion
            ? `${strategyVersion.strategy.name} · v${strategyVersion.version}`
            : `来源信息未记录 ${job.id.slice(0, 8)}`,
          experimentId: null,
          experimentStage: null,
          source: strategyVersion
            ? {
                kind: 'existing',
                strategyId: strategyVersion.strategy.id,
                strategyVersionId: strategyVersion.id,
                strategyName: strategyVersion.strategy.name,
                version: strategyVersion.version,
                schemaVersion: strategyVersion.schemaVersion,
              }
            : null,
          jobs: [summary],
          members: [{ jobId: job.id, relation: 'user', split: null, candidateSource: null }],
        });
        continue;
      }
      const existing = groups.get(association.experimentId);
      if (existing) {
        existing.jobs.push(summary);
        existing.members.push({
          jobId: job.id,
          relation: association.relation,
          split: association.split,
          candidateSource:
            association.relation === 'candidate' &&
            association.candidateId &&
            association.candidateNumber &&
            association.candidateStrategyVersionId
              ? {
                  kind: 'candidate',
                  experimentId: association.experimentId,
                  candidateId: association.candidateId,
                  candidateStrategyVersionId: association.candidateStrategyVersionId,
                  candidateNumber: association.candidateNumber,
                  stage: association.experimentStage,
                }
              : null,
        });
        continue;
      }
      const source = sourceForAssociation(association);
      groups.set(association.experimentId, {
        id: association.experimentId,
        kind: 'experiment',
        name:
          association.experimentName?.trim() ||
          experimentDisplayName({
            name: association.experimentName,
            sourceMode: association.sourceMode,
            discoveryScope: association.discoveryScope,
            strategyName: association.strategyName,
          }),
        experimentId: association.experimentId,
        experimentStage: association.experimentStage,
        source,
        jobs: [summary],
        members: [
          {
            jobId: job.id,
            relation: association.relation,
            split: association.split,
            candidateSource:
              association.relation === 'candidate' &&
              association.candidateId &&
              association.candidateNumber &&
              association.candidateStrategyVersionId
                ? {
                    kind: 'candidate',
                    experimentId: association.experimentId,
                    candidateId: association.candidateId,
                    candidateStrategyVersionId: association.candidateStrategyVersionId,
                    candidateNumber: association.candidateNumber,
                    stage: association.experimentStage,
                  }
                : null,
          },
        ],
      });
    }
    const allGroups = [...groups.values()].filter((group) => {
      if (input.sourceMode && group.source?.kind !== input.sourceMode) return false;
      if (input.search)
        return group.name.toLocaleLowerCase().includes(input.search.toLocaleLowerCase());
      return true;
    });
    allGroups.sort((left, right) => {
      const leftJob = left.jobs[0]!;
      const rightJob = right.jobs[0]!;
      const time = rightJob.createdAt.getTime() - leftJob.createdAt.getTime();
      return time || right.id.localeCompare(left.id);
    });
    const visible = cursor
      ? allGroups.filter((group) => {
          const latest = group.jobs[0]!;
          return (
            latest.createdAt < cursor.createdAt ||
            (latest.createdAt.getTime() === cursor.createdAt.getTime() && group.id < cursor.id)
          );
        })
      : allGroups;
    const items = visible.slice(0, bounded);
    const hasNextPage = visible.length > bounded;
    const tail = items.at(-1);
    const tailJob = tail?.jobs[0];
    return {
      items,
      totalCount: allGroups.length,
      pageInfo: {
        hasNextPage,
        nextCursor:
          hasNextPage && tail && tailJob ? encodeCursor(tailJob.createdAt, tail.id) : null,
      },
    };
  }

  async compare(id: string) {
    const { experiment, candidates, attempts } = await this.get(id);
    const canRank = experiment.readEligibility.state === 'readable';
    const ranked = candidates
      .map((candidate) => {
        const validation = toRecord(candidate.metrics).validation;
        const score = toRecord(validation).score;
        return {
          ...candidate,
          validationScore: canRank && typeof score === 'number' ? score : null,
        };
      })
      .sort((left, right) =>
        canRank
          ? (right.validationScore ?? -Infinity) - (left.validationScore ?? -Infinity)
          : left.candidateNumber - right.candidateNumber,
      );
    const rankingNote = canRank
      ? '排序仅使用 Server 真实回测的 validation 指标；AI 自述指标不会进入评分。'
      : '封存测试尚未统一揭示，暂不提供可推断质量的排序或标签。';
    return {
      experiment,
      baseline: { runRefs: experiment.baselineRunRefs, metrics: experiment.baselineMetrics },
      candidates: ranked,
      attempts,
      note: `${rankingNote}${optimizationUsageNote(experiment, attempts)}`,
    };
  }
}
