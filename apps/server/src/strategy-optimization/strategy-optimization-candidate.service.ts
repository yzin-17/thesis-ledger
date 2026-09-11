import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  optimizationProposalSchema,
  type OptimizationProposal,
  type StrategyParameterDescriptor,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';
import { AiRunService } from '../ai/ai-run.service.js';
import { AiProviderRegistry } from '../ai/provider-registry.js';
import { PrismaService } from '../platform/prisma.service.js';
import {
  asJson,
  optimizationSha256,
  redactOptimizationError,
  toRecord,
  type CandidateRow,
  type ExperimentRow,
  type StrategyVersionRecord,
} from './strategy-optimization-common.js';
import {
  applyOptimizationProposal,
  proposalDiff,
} from './strategy-optimization-parameters.js';
import { StrategyOptimizationRunService } from './strategy-optimization-run.service.js';

@Injectable()
export class StrategyOptimizationCandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRuns: AiRunService,
    private readonly providers: AiProviderRegistry,
    private readonly runs: StrategyOptimizationRunService,
  ) {}

  private async priorFeedback(experimentId: string, modelKey: string) {
    const rows = await this.prisma.$queryRaw<Array<{ diff: unknown; metrics: unknown }>>(Prisma.sql`
      SELECT "diff", "metrics" FROM "OptimizationCandidate"
      WHERE "experimentId"=${experimentId}::uuid AND "modelKey"=${modelKey}
      ORDER BY "candidateNumber" DESC LIMIT 3
    `);
    return rows.map((row) => ({ diff: row.diff, metrics: row.metrics }));
  }

  private async prompt(
    experiment: ExperimentRow,
    strategy: StrategySchemaV2,
    descriptors: StrategyParameterDescriptor[],
    modelKey: string,
    round: number,
  ) {
    const allowed = new Set(experiment.allowedParameterIds as string[]);
    const authorized = descriptors.filter((item) => allowed.has(item.parameterId));
    const priorCandidates = await this.priorFeedback(experiment.id, modelKey);
    return [
      {
        role: 'system',
        content:
          '你是策略参数优化器。只能修改允许的 parameterId；不得修改数据、执行语义或生成代码。只输出 OptimizationProposal JSON。不得声明收益率或回测结果，真实结果以服务端回测为准。',
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
          priorCandidates,
          strategy: {
            name: strategy.name,
            primaryTimeframe: strategy.primaryTimeframe,
            executionInstrument: strategy.executionInstrument,
          },
        })}`,
      },
    ];
  }

  async generateProposal(
    experiment: ExperimentRow,
    baseline: StrategyVersionRecord & { strategy: StrategySchemaV2 },
    descriptors: StrategyParameterDescriptor[],
    route: { provider: string; model: string },
    round: number,
  ) {
    const modelKey = `${route.provider}:${route.model}`;
    const estimatedCost = 0;
    await this.runs.reserveBudget(experiment.id, { aiCalls: 1, estimatedCost });
    const aiRun = await this.aiRuns.start(
      route.provider,
      route.model,
      'strategy-optimization-v1',
      { scope: 'strategy', strategyVersionId: baseline.id },
      {
        optimizationExperimentId: experiment.id,
        requestedProvider: route.provider,
        requestedModel: route.model,
        round,
      },
      `优化策略 ${baseline.strategy.name}`,
    );
    return this.completeProposal(
      experiment,
      baseline,
      descriptors,
      route,
      round,
      modelKey,
      aiRun.id,
      estimatedCost,
    );
  }

  private async completeProposal(
    experiment: ExperimentRow,
    baseline: StrategyVersionRecord & { strategy: StrategySchemaV2 },
    descriptors: StrategyParameterDescriptor[],
    route: { provider: string; model: string },
    round: number,
    modelKey: string,
    aiRunId: string,
    estimatedCost: number,
  ) {
    const startedAt = Date.now();
    try {
      const provider = this.providers.strict(route.provider, route.model);
      const completion = await provider.complete(
        {
          model: route.model,
          messages: await this.prompt(
            experiment,
            baseline.strategy,
            descriptors,
            modelKey,
            round,
          ),
          tools: [],
        },
        AbortSignal.timeout(60_000),
      );
      const proposal = optimizationProposalSchema.parse(completion.content);
      await this.prisma.aiRun.update({
        where: { id: aiRunId },
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
      await this.runs.reconcileCost(experiment.id, estimatedCost, completion.cost);
      return { proposal, aiRunId, modelKey };
    } catch (error) {
      await this.aiRuns.fail(
        aiRunId,
        'optimization_proposal_failed',
        redactOptimizationError(error),
        Date.now() - startedAt,
      );
      throw error;
    }
  }

  async recordAttempt(input: {
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

  private async nextNegativeVersion(strategyId: string) {
    const min = await this.prisma.strategyVersion.aggregate({
      where: { strategyId },
      _min: { version: true },
    });
    return Math.min(min._min.version ?? 0, 0) - 1;
  }

  private async createCandidateVersion(
    baseline: StrategyVersionRecord,
    strategy: StrategySchemaV2,
  ) {
    return this.prisma.strategyVersion.create({
      data: {
        strategyId: baseline.strategyId,
        version: await this.nextNegativeVersion(baseline.strategyId),
        schemaVersion: 2,
        schema: asJson(strategy),
      },
    });
  }

  private async existingByHash(experimentId: string, executionHash: string) {
    const rows = await this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationCandidate"
      WHERE "experimentId"=${experimentId}::uuid AND "executionHash"=${executionHash} LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async insertCandidate(
    experiment: ExperimentRow,
    baseline: StrategyVersionRecord & { strategy: StrategySchemaV2 },
    descriptors: StrategyParameterDescriptor[],
    modelKey: string,
    proposal: OptimizationProposal,
    strategy: StrategySchemaV2,
    executionHash: string,
  ) {
    const version = await this.createCandidateVersion(baseline, strategy);
    const count = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "OptimizationCandidate" WHERE "experimentId"=${experiment.id}::uuid
    `);
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      INSERT INTO "OptimizationCandidate" (
        "id", "experimentId", "candidateNumber", "modelKey", "candidateStrategyVersionId", "executionHash",
        "proposal", "diff", "validationStatus", "runRefs", "metrics"
      ) VALUES (
        ${id}::uuid, ${experiment.id}::uuid, ${Number(count[0]?.count ?? 0n) + 1}, ${modelKey}, ${version.id}::uuid,
        ${executionHash}, ${JSON.stringify(proposal)}::jsonb,
        ${JSON.stringify(proposalDiff(baseline.strategy, strategy, descriptors))}::jsonb,
        'evaluating', '{}'::jsonb, '{}'::jsonb
      ) RETURNING *
    `);
    return rows[0]!;
  }

  private async persistEvaluation(
    candidate: CandidateRow,
    runRefs: Record<string, string>,
    metrics: Record<string, unknown>,
  ) {
    const development = toRecord(metrics.development);
    const validation = toRecord(metrics.validation);
    const valid = development.status === 'valid' && validation.status === 'valid';
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "runRefs"=${JSON.stringify(runRefs)}::jsonb, "metrics"=${JSON.stringify(metrics)}::jsonb,
          "validationStatus"=${valid ? 'valid' : 'invalid'}
      WHERE "id"=${candidate.id}::uuid
    `);
    return { ...candidate, runRefs, metrics, validationStatus: valid ? 'valid' : 'invalid' };
  }

  private async evaluateCandidate(experiment: ExperimentRow, candidate: CandidateRow) {
    const fingerprints = toRecord(experiment.frozenDataFingerprints);
    const development = await this.runs.evaluateCandidateSplit(
      experiment,
      candidate.candidateStrategyVersionId,
      candidate.id,
      'development',
      fingerprints.development,
    );
    const validation = await this.runs.evaluateCandidateSplit(
      experiment,
      candidate.candidateStrategyVersionId,
      candidate.id,
      'validation',
      fingerprints.validation,
    );
    return this.persistEvaluation(
      candidate,
      { development: development.run.id, validation: validation.run.id },
      { development: development.summary, validation: validation.summary },
    );
  }

  async createAndEvaluateCandidate(
    experiment: ExperimentRow,
    baseline: StrategyVersionRecord & { strategy: StrategySchemaV2 },
    descriptors: StrategyParameterDescriptor[],
    modelKey: string,
    proposal: OptimizationProposal,
  ) {
    const strategy = applyOptimizationProposal(
      baseline.strategy,
      descriptors,
      experiment.allowedParameterIds as string[],
      proposal,
    );
    const executionHash = optimizationSha256(strategy);
    const duplicate = await this.existingByHash(experiment.id, executionHash);
    if (duplicate) return { candidate: duplicate, duplicate: true };
    const candidate = await this.insertCandidate(
      experiment,
      baseline,
      descriptors,
      modelKey,
      proposal,
      strategy,
      executionHash,
    );
    return {
      candidate: await this.evaluateCandidate(experiment, candidate),
      duplicate: false,
    };
  }

  validateAuthorizedParameters(
    descriptors: StrategyParameterDescriptor[],
    allowedParameterIds: string[],
  ) {
    const descriptorIds = new Set(descriptors.map((item) => item.parameterId));
    const unsupported = allowedParameterIds.find((parameterId) => !descriptorIds.has(parameterId));
    if (unsupported) throw new BadRequestException(`不可优化的参数: ${unsupported}`);
  }
}
