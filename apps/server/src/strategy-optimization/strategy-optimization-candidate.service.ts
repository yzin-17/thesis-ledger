import { optimizationRetryStateSchema } from '@thesis-ledger/schemas';
import { materializeEntryPolicy } from '@thesis-ledger/domain';
import { requireNewStrategyDefinition } from '../backtest/strategy-definition-write.js';
import { assertStrategyResearchScopeV3 } from '../backtest/backtest-research-data-scope-v3.js';
import { runConfigSchemaV3 } from '@thesis-ledger/schemas';
import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  optimizationProposalSchema,
  type OptimizationProposal,
  type OptimizationDiscoveryProposal,
  type StrategyParameterDescriptor,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { AiProviderRegistry } from '../ai/provider-registry.js';
import { PrismaService } from '../platform/prisma.service.js';
import {
  asJson,
  optimizationSha256,
  type CandidateRow,
  type ExperimentRow,
  type StrategyVersionRecord,
} from './strategy-optimization-common.js';
import { applyOptimizationProposal, proposalDiff } from './strategy-optimization-parameters.js';
import { StrategyOptimizationRunService } from './strategy-optimization-run.service.js';
import { evaluateOptimizationCandidate } from './strategy-optimization-candidate-evaluation.js';
import type { OptimizationModelRoute } from './strategy-optimization-model-routing.js';
import {
  discoveryCandidateDiff,
  discoveryCandidateStrategy,
  parseDiscoveryOutput,
} from './strategy-optimization-discovery.js';
import { recordOptimizationAttempt } from './strategy-optimization-attempt.store.js';
import {
  normalizeCostCurrency,
  optimizationPricingForExperimentRoute,
} from './strategy-optimization-cost.js';
import {
  markOptimizationUnknownOutcome,
  type OptimizationStepRow,
} from './strategy-optimization-attempt-lifecycle.js';
import { StrategyOptimizationSdkExecutor } from './strategy-optimization-sdk-executor.js';
import { prepareOptimizationGeneration, STRATEGY_OPTIMIZATION_PROMPT_VERSION } from './strategy-optimization-prompt.js';
import {
  reusableOptimizationSdkCache,
  type OptimizationSdkCacheIdentity,
} from './strategy-optimization-sdk-cache.js';

type ProviderRoute = OptimizationModelRoute;
const OPTIMIZATION_PROVIDER_REQUEST_CEILING_MS = 120_000;

const missingSdkExecutor = {
  resolveRoute: () => {
    throw new Error('策略优化 SDK 执行器未装配；禁止回退 legacy Provider 调用');
  },
} as unknown as StrategyOptimizationSdkExecutor;

const stepError = (message: string) => new Error(message);

@Injectable()
export class StrategyOptimizationCandidateService {
  constructor(
    private readonly prisma: PrismaService,
    _providers: AiProviderRegistry,
    private readonly runs: StrategyOptimizationRunService,
    private readonly sdkExecutor: StrategyOptimizationSdkExecutor = missingSdkExecutor,
  ) {}

  private async step(experimentId: string, modelKey: string, round: number) {
    const rows = await this.prisma.$queryRaw<OptimizationStepRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationAttempt"
      WHERE "experimentId"=${experimentId}::uuid AND "modelKey"=${modelKey} AND "attempt"=${round}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async assertNoUnknownOutcome(experiment: ExperimentRow, modelKey: string) {
    const allowed = optimizationRetryStateSchema.parse(experiment.retryState ?? {}).allowedUnknownAttemptIds;
    const rows = await this.prisma.$queryRaw<Array<{ id: string; attempt: number }>>(Prisma.sql`
      SELECT "id", "attempt" FROM "OptimizationAttempt"
      WHERE "experimentId"=${experiment.id}::uuid AND "modelKey"=${modelKey} AND "status"='unknown_outcome'
        AND NOT ("id"::text = ANY(${allowed}::text[]))
      ORDER BY "attempt" ASC LIMIT 1
    `);
    const blocked = rows[0];
    if (blocked)
      throw stepError(
        `模型 ${modelKey} 第 ${blocked.attempt} 轮结果为 unknown_outcome；禁止自动再次请求 Provider，需显式恢复`,
      );
  }

  private async reserveStep(experiment: ExperimentRow, modelKey: string, round: number) {
    const experimentId = experiment.id;
    await this.assertNoUnknownOutcome(experiment, modelKey);
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
    await markOptimizationUnknownOutcome(this.prisma, step, error, durationMs);
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
    baseline: StrategyVersionRecord & { strategy: BacktestStrategy };
    route: ProviderRoute;
    inputTokenReservation: number;
    outputTokenReservation: number;
    estimatedCost: number;
    sdkCacheIdentity: OptimizationSdkCacheIdentity | null;
  }) {
    const now = new Date();
    const requestTimeout = this.runs.requestTimeoutMs(
      input.experiment,
      OPTIMIZATION_PROVIDER_REQUEST_CEILING_MS,
    );
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
          executionAttempt: input.experiment.executionAttempt,
        },
        transaction,
      );
      const aiRun = await transaction.aiRun.create({
        data: {
          provider: input.route.provider,
          model: input.route.model,
          promptVersion: STRATEGY_OPTIMIZATION_PROMPT_VERSION,
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
            ...(input.sdkCacheIdentity === null
              ? {}
              : { sdkCacheIdentity: input.sdkCacheIdentity }),
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
    baseline: StrategyVersionRecord & { strategy: BacktestStrategy };
    route: ProviderRoute;
    modelKey: string;
    round: number;
    inputTokenReservation: number;
    outputTokenReservation: number;
    estimatedCost: number;
    sdkCacheIdentity: OptimizationSdkCacheIdentity | null;
  }) {
    let current = await this.reserveStep(input.experiment, input.modelKey, input.round);
    if (current.status === 'succeeded') {
      if (!current.aiRunId) throw stepError('已完成优化步骤缺少 AiRun');
      const continuationBlockedReason = await reusableOptimizationSdkCache(
        this.prisma,
        current.aiRunId,
        input.sdkCacheIdentity,
      );
      return {
        cached: true as const,
        step: current,
        continuationBlockedReason,
        proposal:
          input.experiment.sourceMode === 'discovery'
            ? parseDiscoveryOutput(input.experiment, current.proposal)
            : optimizationProposalSchema.parse(current.proposal),
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
      sdkCacheIdentity: input.sdkCacheIdentity,
    });
    if (claimed) return { cached: false as const, step: claimed };
    current = (await this.step(input.experiment.id, input.modelKey, input.round)) ?? current;
    if (current.status === 'succeeded' && current.aiRunId)
      return {
        cached: true as const,
        step: current,
        continuationBlockedReason: await reusableOptimizationSdkCache(
          this.prisma,
          current.aiRunId,
          input.sdkCacheIdentity,
        ),
        proposal:
          input.experiment.sourceMode === 'discovery'
            ? parseDiscoveryOutput(input.experiment, current.proposal)
            : optimizationProposalSchema.parse(current.proposal),
      };
    throw stepError('优化步骤未取得执行权，不会重复请求 Provider');
  }

  async generateProposal(
    experiment: ExperimentRow,
    baseline: StrategyVersionRecord & { strategy: BacktestStrategy },
    descriptors: StrategyParameterDescriptor[],
    route: ProviderRoute,
    round: number,
  ) {
    const modelKey = `${route.provider}:${route.model}`;
    // 预算、提示与执行共用本次冻结路由，领取后热更新不改写在途快照。
    const resolved = this.sdkExecutor.resolveRoute(experiment, route);
    const { messages, inputTokenReservation } = await prepareOptimizationGeneration({
      prisma: this.prisma,
      experiment,
      strategy: baseline.strategy,
      descriptors,
      modelKey,
      round,
      useSdkContract: true,
      generationMode: resolved.execution.mode,
    });
    const sdkCacheIdentity = {
      adapter: resolved.execution.adapter,
      mode: resolved.execution.mode,
      contract: resolved.execution.contract,
      configurationFingerprint: resolved.execution.readiness.configurationFingerprint,
    };
    const provider = resolved.provider;
    const outputTokenReservation = this.runs.outputTokenReservation(experiment);
    const pricing = optimizationPricingForExperimentRoute(
      experiment.modelConfig,
      route.provider,
      route.model,
      provider.metadata,
    );
    const currency = normalizeCostCurrency(pricing?.costCurrency);
    const inputRate = pricing?.costPer1kInput;
    const outputRate = pricing?.costPer1kOutput;
    const estimatedCost =
      currency &&
      typeof inputRate === 'number' &&
      typeof outputRate === 'number'
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
      sdkCacheIdentity,
    });
    if (prepared.cached)
      return {
        proposal: prepared.proposal,
        aiRunId: prepared.step.aiRunId!,
        modelKey,
        continuationBlockedReason: prepared.continuationBlockedReason,
      };
    return this.sdkExecutor.completeProposal({
      experiment,
      baseline: baseline.strategy,
      route,
      modelKey,
      step: prepared.step,
      messages,
      inputTokenReservation,
      outputTokenReservation,
      estimatedCost,
      resolved,
      requestTimeoutMs: this.runs.requestTimeoutMs(
        experiment,
        OPTIMIZATION_PROVIDER_REQUEST_CEILING_MS,
      ),
    });
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
    strategy: BacktestStrategy,
  ) {
    requireNewStrategyDefinition(strategy);
    return this.prisma.strategyVersion.create({
      data: {
        strategyId: baseline.strategyId,
        version: await this.nextNegativeVersion(baseline.strategyId),
        schemaVersion: 1,
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
    baseline: StrategyVersionRecord & { strategy: BacktestStrategy },
    descriptors: StrategyParameterDescriptor[],
    modelKey: string,
    proposal: OptimizationProposal | OptimizationDiscoveryProposal,
    strategy: BacktestStrategy,
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
        ${JSON.stringify(
          experiment.sourceMode === 'discovery'
            ? discoveryCandidateDiff()
            : proposalDiff(baseline.strategy, strategy, descriptors),
        )}::jsonb,
        'evaluating', '{}'::jsonb, '{}'::jsonb
      ) RETURNING *
    `);
    return rows[0]!;
  }

  async createAndEvaluateCandidate(
    experiment: ExperimentRow,
    baseline: StrategyVersionRecord & { strategy: BacktestStrategy },
    descriptors: StrategyParameterDescriptor[],
    modelKey: string,
    proposal: OptimizationProposal | OptimizationDiscoveryProposal,
  ) {
    const candidateDefinition =
      experiment.sourceMode === 'discovery'
        ? discoveryCandidateStrategy(experiment, proposal as OptimizationDiscoveryProposal)
        : applyOptimizationProposal(
            baseline.strategy,
            descriptors,
            experiment.allowedParameterIds as string[],
            proposal as OptimizationProposal,
          );
    const strategy = materializeEntryPolicy(candidateDefinition);
    assertStrategyResearchScopeV3(strategy, runConfigSchemaV3.parse(experiment.runConfig));
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
      candidate: await evaluateOptimizationCandidate(this.prisma, this.runs, experiment, candidate),
      duplicate: false,
    };
  }

  recordAttempt(input: Parameters<typeof recordOptimizationAttempt>[1]) {
    return recordOptimizationAttempt(this.prisma, input);
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
