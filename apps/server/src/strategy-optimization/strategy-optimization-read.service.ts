import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { strategySchemaV2, type StrategySchemaV2 } from '@thesis-ledger/schemas';
import { AiProviderRegistry } from '../ai/provider-registry.js';
import { PrismaService } from '../platform/prisma.service.js';
import {
  toRecord,
  type AttemptRow,
  type CandidateRow,
  type ExperimentRow,
} from './strategy-optimization-common.js';
import { describeStrategyParameters } from './strategy-optimization-parameters.js';

@Injectable()
export class StrategyOptimizationReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AiProviderRegistry,
  ) {}

  capabilities() {
    return {
      riskApplicationsEnabled: process.env.STRATEGY_RISK_APPLICATIONS_ENABLED !== 'false',
      aiOptimizationEnabled: process.env.STRATEGY_AI_OPTIMIZATION_ENABLED !== 'false',
      providers: this.providers.list().flatMap((provider) => {
        const costKnown =
          typeof provider.metadata?.costPer1kInput === 'number' &&
          typeof provider.metadata?.costPer1kOutput === 'number';
        return provider.models.map((model) => ({
          provider: provider.id,
          model,
          costStatus: costKnown ? ('known' as const) : ('unknown' as const),
          ...(provider.metadata?.costCurrency ? { costCurrency: provider.metadata.costCurrency } : {}),
          ...(provider.metadata?.pricingVersion
            ? { pricingVersion: provider.metadata.pricingVersion }
            : {}),
        }));
      }),
    };
  }

  async parameters(strategyVersionId: string) {
    const version = await this.prisma.strategyVersion.findUnique({ where: { id: strategyVersionId } });
    if (!version) throw new NotFoundException('策略版本不存在');
    if (version.schemaVersion !== 2 || version.version <= 0)
      throw new BadRequestException('只有正式 V2 策略版本可以配置优化参数');
    return describeStrategyParameters(strategySchemaV2.parse(version.schema) as StrategySchemaV2);
  }

  async experiment(id: string) {
    const rows = await this.prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment"
      WHERE "id"=${id}::uuid AND "ownerKey"='local-user' LIMIT 1
    `);
    const row = rows[0];
    if (!row) throw new NotFoundException('优化实验不存在');
    return row;
  }

  candidates(id: string) {
    return this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationCandidate"
      WHERE "experimentId"=${id}::uuid ORDER BY "candidateNumber" ASC
    `);
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
    return { experiment, candidates, attempts };
  }

  async list(limit = 30) {
    const bounded = Math.max(1, Math.min(limit, 100));
    return this.prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "ownerKey"='local-user'
      ORDER BY "createdAt" DESC, "id" DESC LIMIT ${bounded}
    `);
  }

  private usageNote(experiment: ExperimentRow, attempts: AttemptRow[]) {
    const routes = Array.isArray(experiment.modelConfig) ? experiment.modelConfig : [];
    const summaries = routes.flatMap((routeValue) => {
      const route = toRecord(routeValue);
      if (typeof route.provider !== 'string' || typeof route.model !== 'string') return [];
      const modelKey = `${route.provider}:${route.model}`;
      const modelAttempts = attempts.filter((attempt) => attempt.modelKey === modelKey);
      const inputTokens = modelAttempts.reduce((sum, attempt) => sum + (attempt.inputTokens ?? 0), 0);
      const outputTokens = modelAttempts.reduce((sum, attempt) => sum + (attempt.outputTokens ?? 0), 0);
      const durationMs = modelAttempts.reduce((sum, attempt) => sum + (attempt.durationMs ?? 0), 0);
      const costUnknown =
        route.costStatus === 'unknown' ||
        modelAttempts.some((attempt) => toRecord(attempt.modelMetadata).costStatus === 'unknown');
      const cost = modelAttempts.reduce((sum, attempt) => {
        if (attempt.cost === null) return sum;
        const value = Number(attempt.cost.toString());
        return Number.isFinite(value) ? sum + value : sum;
      }, 0);
      const costText = costUnknown ? '费用未知' : `费用 ${cost.toFixed(6)}`;
      return [
        `${modelKey}：${modelAttempts.length} 次，Token ${inputTokens}/${outputTokens}，耗时 ${(durationMs / 1000).toFixed(1)}s，${costText}`,
      ];
    });
    return summaries.length > 0 ? ` 模型调用：${summaries.join('；')}。` : '';
  }

  async compare(id: string) {
    const { experiment, candidates, attempts } = await this.get(id);
    const ranked = candidates
      .map((candidate) => {
        const validation = toRecord(candidate.metrics).validation;
        const score = toRecord(validation).score;
        return { ...candidate, validationScore: typeof score === 'number' ? score : null };
      })
      .sort(
        (left, right) => (right.validationScore ?? -Infinity) - (left.validationScore ?? -Infinity),
      );
    return {
      experiment,
      baseline: { runRefs: experiment.baselineRunRefs, metrics: experiment.baselineMetrics },
      candidates: ranked,
      attempts,
      note: `排序仅使用 Server 真实回测的 validation 指标；AI 自述指标不会进入评分。${this.usageNote(experiment, attempts)}`,
    };
  }
}
