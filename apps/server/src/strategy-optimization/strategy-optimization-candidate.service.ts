import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  optimizationProposalSchema,
  type OptimizationProposal,
  type StrategyParameterDescriptor,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';
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
import { optimizationModelConcurrency } from './strategy-optimization-concurrency.js';
import {
  applyOptimizationProposal,
  proposalDiff,
} from './strategy-optimization-parameters.js';
import { StrategyOptimizationRunService } from './strategy-optimization-run.service.js';

type ProviderRoute = { provider: string; model: string };
type OptimizationStepRow = {
  id: string;
  experimentId: string;
  modelKey: string;
  aiRunId: string | null;
  attempt: number;
  status: string;
  proposal: unknown;
  error: string | null;
  startedAt: Date | null;
  leaseUntil: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

const stepError = (message: string) => new Error(message);

@Injectable()
export class StrategyOptimizationCandidateService {
  constructor(
    private readonly prisma: PrismaService,
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

  private async step(experimentId: string, modelKey: string, round: number) {
    const rows = await this.prisma.$queryRaw<OptimizationStepRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationAttempt"
      WHERE "experimentId"=${experimentId}::uuid AND "modelKey"=${modelKey} AND "attempt"=${round}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async assertNoUnknownOutcome(experimentId: string, modelKey: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; attempt: number }>>(Prisma.sql`
      SELECT "id", "attempt" FROM "OptimizationAttempt"
      WHERE "experimentId"=${experimentId}::uuid AND "modelKey"=${modelKey} AND "status"='unknown_outcome'
      ORDER BY "attempt" ASC LIMIT 1
    `);
    const blocked = rows[0];
    if (blocked)
      throw stepError(
        `模型 ${modelKey} 第 ${blocked.attempt} 轮结果为 unknown_outcome；禁止自动再次请求 Provider，需显式恢复`,
      );
  }

  private async reserveStep(experimentId: string, modelKey: string, round: number) {
    await this.assertNoUnknownOutcome(experimentId, modelKey);
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationAttempt" ("experimentId", "modelKey", "attempt", "status")
      VALUES (${experimentId}::uuid, ${modelKey}, ${round}, 'reserved')
      ON CONFLICT ("experimentId", "modelKey", "attempt") DO NOTHING
    `);
    const current = await this.step(experimentId, modelKey, round);
    if (!current) throw stepError('优化步骤预留失败');
    return current;
  }

  private async markUnknownOutcome(step: OptimizationStepRow, error: unknown, durationMs?: number) {
    const summary = redactOptimizationError(error);
    const rows = await this.prisma.$queryRaw<Array<{ aiRunId: string | null }>>(Prisma.sql`
      UPDATE "OptimizationAttempt"
      SET "status"='unknown_outcome', "error"=${summary}, "leaseUntil"=NULL, "completedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${step.id}::uuid AND "status"='running'
      RETURNING "aiRunId"
    `);
    const aiRunId = rows[0]?.aiRunId ?? step.aiRunId;
    if (aiRunId) {
      await this.prisma.aiRun.updateMany({
        where: { id: aiRunId, status: 'running' },
        data: {
          status: 'failed',
          errorCode: 'optimization_unknown_outcome',
          errorSummary: summary,
          completedAt: new Date(),
          claimedAt: null,
          leaseUntil: null,
          ...(durationMs === undefined ? {} : { durationMs }),
        },
      });
    }
  }

  private async markKnownFailure(step: OptimizationStepRow, error: unknown, durationMs?: number) {
    const summary = redactOptimizationError(error);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationAttempt"
      SET "status"='failed', "error"=${summary}, "leaseUntil"=NULL, "completedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${step.id}::uuid AND "status"='running'
    `);
    if (step.aiRunId) {
      await this.prisma.aiRun.updateMany({
        where: { id: step.aiRunId, status: 'running' },
        data: {
          status: 'failed',
          errorCode: 'optimization_proposal_failed',
          errorSummary: summary,
          completedAt: new Date(),
          claimedAt: null,
          leaseUntil: null,
          ...(durationMs === undefined ? {} : { durationMs }),
        },
      });
    }
  }

  private async recoverExpiredRunningStep(step: OptimizationStepRow) {
    if (step.status !== 'running') return false;
    if (!step.leaseUntil || step.leaseUntil.getTime() >= Date.now()) return false;
    await this.markUnknownOutcome(
      step,
      new Error('优化 Provider 调用租约已过期；外部请求是否完成未知，禁止自动重试'),
    );
    return true;
  }

  private async claimStep(input: {
    step: OptimizationStepRow;
    experiment: ExperimentRow;
    baseline: StrategyVersionRecord & { strategy: StrategySchemaV2 };
    route: ProviderRoute;
    inputTokenReservation: number;
    outputTokenReservation: number;
    estimatedCost: number;
  }) {
    const now = new Date();
    const requestTimeout = this.runs.requestTimeoutMs(input.experiment, 60_000);
    const leaseUntil = new Date(now.getTime() + requestTimeout + 30_000);
    return this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.$queryRaw<OptimizationStepRow[]>(Prisma.sql`
        UPDATE "OptimizationAttempt"
        SET "status"='running', "startedAt"=${now}, "leaseUntil"=${leaseUntil}, "error"=NULL
        WHERE "id"=${input.step.id}::uuid AND "status"='reserved'
        RETURNING *
      `);
      const running = claimed[0];
      if (!running) return null;
      await this.runs.reserveBudget(
        input.experiment.id,
        {
          aiCalls: 1,
          inputTokens: input.inputTokenReservation,
          outputTokens: input.outputTokenReservation,
          estimatedCost: input.estimatedCost,
        },
        transaction,
      );
      const aiRun = await transaction.aiRun.create({
        data: {
          provider: input.route.provider,
          model: input.route.model,
          promptVersion: 'strategy-optimization-v1',
          status: 'running',
          startedAt: now,
          claimedAt: now,
          leaseUntil,
          executionAttempt: 1,
          context: asJson({ scope: 'strategy', strategyVersionId: input.baseline.id }),
          modelMetadata: asJson({
            optimizationExperimentId: input.experiment.id,
            requestedProvider: input.route.provider,
            requestedModel: input.route.model,
            round: input.step.attempt,
            fallbackUsed: false,
          }),
          question: `优化策略 ${input.baseline.strategy.name}`,
        },
      });
      await transaction.$executeRaw(Prisma.sql`
        UPDATE "OptimizationAttempt" SET "aiRunId"=${aiRun.id}::uuid WHERE "id"=${input.step.id}::uuid
      `);
      return { ...running, aiRunId: aiRun.id, leaseUntil };
    });
  }

  private async claimedOrCachedStep(input: {
    experiment: ExperimentRow;
    baseline: StrategyVersionRecord & { strategy: StrategySchemaV2 };
    route: ProviderRoute;
    modelKey: string;
    round: number;
    inputTokenReservation: number;
    outputTokenReservation: number;
    estimatedCost: number;
  }) {
    let current = await this.reserveStep(input.experiment.id, input.modelKey, input.round);
    if (current.status === 'succeeded') {
      if (!current.aiRunId) throw stepError('已完成优化步骤缺少 AiRun');
      return {
        cached: true as const,
        step: current,
        proposal: optimizationProposalSchema.parse(current.proposal),
      };
    }
    if (current.status === 'unknown_outcome')
      throw stepError('优化步骤结果未知，禁止自动再次请求 Provider');
    if (current.status === 'failed') throw stepError('优化步骤已失败，禁止自动重试');
    if (await this.recoverExpiredRunningStep(current))
      throw stepError('优化步骤租约过期且结果未知，禁止自动重试');
    if (current.status === 'running') throw stepError('优化步骤正在由其他 Worker 执行');
    const claimed = await this.claimStep({
      step: current,
      experiment: input.experiment,
      baseline: input.baseline,
      route: input.route,
      inputTokenReservation: input.inputTokenReservation,
      outputTokenReservation: input.outputTokenReservation,
      estimatedCost: input.estimatedCost,
    });
    if (claimed) return { cached: false as const, step: claimed };
    current = (await this.step(input.experiment.id, input.modelKey, input.round)) ?? current;
    if (current.status === 'succeeded' && current.aiRunId)
      return {
        cached: true as const,
        step: current,
        proposal: optimizationProposalSchema.parse(current.proposal),
      };
    throw stepError('优化步骤未取得执行权，不会重复请求 Provider');
  }

  async generateProposal(
    experiment: ExperimentRow,
    baseline: StrategyVersionRecord & { strategy: StrategySchemaV2 },
    descriptors: StrategyParameterDescriptor[],
    route: ProviderRoute,
    round: number,
  ) {
    const modelKey = `${route.provider}:${route.model}`;
    const provider = this.providers.strict(route.provider, route.model);
    const messages = await this.prompt(experiment, baseline.strategy, descriptors, modelKey, round);
    const inputTokenReservation = this.runs.conservativeInputTokenReservation(messages);
    const outputTokenReservation = this.runs.outputTokenReservation(experiment);
    const inputRate = provider.metadata?.costPer1kInput;
    const outputRate = provider.metadata?.costPer1kOutput;
    const estimatedCost =
      typeof inputRate === 'number' && typeof outputRate === 'number'
        ? (inputTokenReservation * inputRate + outputTokenReservation * outputRate) / 1_000
        : 0;
    const prepared = await this.claimedOrCachedStep({
      experiment,
      baseline,
      route,
      modelKey,
      round,
      inputTokenReservation,
      outputTokenReservation,
      estimatedCost,
    });
    if (prepared.cached)
      return { proposal: prepared.proposal, aiRunId: prepared.step.aiRunId!, modelKey };
    return this.completeProposal(
      experiment,
      route,
      modelKey,
      prepared.step,
      estimatedCost,
      messages,
      inputTokenReservation,
      outputTokenReservation,
    );
  }

  private async completeProposal(
    experiment: ExperimentRow,
    route: ProviderRoute,
    modelKey: string,
    step: OptimizationStepRow,
    estimatedCost: number,
    messages: unknown[],
    inputTokenReservation: number,
    outputTokenReservation: number,
  ) {
    const provider = this.providers.strict(route.provider, route.model);
    const startedAt = Date.now();
    let providerResponded = false;
    try {
      const completion = await optimizationModelConcurrency.withSlot(modelKey, () =>
        provider.complete(
          {
            model: route.model,
            messages,
            tools: [],
            maxOutputTokens: outputTokenReservation,
          },
          AbortSignal.timeout(this.runs.requestTimeoutMs(experiment, 60_000)),
        ),
      );
      providerResponded = true;
      const durationMs = Date.now() - startedAt;
      await this.prisma.aiRun.update({
        where: { id: step.aiRunId! },
        data: {
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          cost: completion.cost,
          durationMs,
          modelMetadata: asJson({
            optimizationExperimentId: experiment.id,
            requestedProvider: route.provider,
            actualProvider: provider.id,
            requestedModel: route.model,
            actualModel: completion.actualModel ?? route.model,
            costStatus: completion.costKnown === false ? 'unknown' : 'known',
            ...(completion.costCurrency ? { costCurrency: completion.costCurrency } : {}),
            ...(completion.pricingVersion ? { pricingVersion: completion.pricingVersion } : {}),
            round: step.attempt,
            retryCount: 0,
            fallbackUsed: false,
          }),
        },
      });
      await this.runs.reconcileTokenUsage(
        experiment.id,
        inputTokenReservation,
        outputTokenReservation,
        completion.inputTokens,
        completion.outputTokens,
      );
      await this.runs.reconcileCost(experiment.id, estimatedCost, completion.cost);
      const proposal = optimizationProposalSchema.parse(completion.content);
      await this.prisma.$transaction(async (transaction) => {
        await transaction.aiRun.update({
          where: { id: step.aiRunId! },
          data: {
            status: 'succeeded',
            result: asJson(proposal),
            completedAt: new Date(),
            claimedAt: null,
            leaseUntil: null,
          },
        });
        await transaction.$executeRaw(Prisma.sql`
          UPDATE "OptimizationAttempt"
          SET "status"='succeeded', "proposal"=${JSON.stringify(proposal)}::jsonb,
              "error"=NULL, "leaseUntil"=NULL, "completedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${step.id}::uuid AND "status"='running'
        `);
      });
      return { proposal, aiRunId: step.aiRunId!, modelKey };
    } catch (error) {
      if (providerResponded) await this.markKnownFailure(step, error, Date.now() - startedAt);
      else await this.markUnknownOutcome(step, error, Date.now() - startedAt);
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
    if (!['failed', 'unknown_outcome'].includes(input.status)) return;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationAttempt"
      SET "status"=${input.status}, "error"=${input.error ?? null}, "leaseUntil"=NULL,
          "completedAt"=CURRENT_TIMESTAMP
      WHERE "experimentId"=${input.experimentId}::uuid AND "modelKey"=${input.modelKey}
        AND "attempt"=${input.attempt} AND "status"='reserved'
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
