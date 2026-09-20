import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import {
  aiGenerationContracts,
  aiGenerationErrorSchema,
  type AiCostFacts,
  type AiProviderModelExecution,
  type AiUsageFacts,
  type OptimizationDiscoveryProposal,
  type OptimizationProposal,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';
import { AiExecutionStateStore } from '../ai/ai-execution-state.store.js';
import { AiSdkGenerationAdapter, AiSdkGenerationError } from '../ai/ai-sdk-generation.adapter.js';
import { AiProviderRegistry } from '../ai/provider-registry.js';
import { PrismaService } from '../platform/prisma.service.js';
import { optimizationModelConcurrency } from './strategy-optimization-concurrency.js';
import { assembleDiscoveryGeneration } from './strategy-optimization-discovery.js';
import {
  markOptimizationKnownFailure,
  markOptimizationUnknownOutcome,
  type OptimizationStepRow,
} from './strategy-optimization-attempt-lifecycle.js';
import { StrategyOptimizationAiSettlementStore } from './strategy-optimization-ai-settlement.store.js';
import { normalizeCostCurrency, normalizePricingVersion } from './strategy-optimization-cost.js';
import { toRecord, type ExperimentRow } from './strategy-optimization-common.js';
import type { OptimizationModelRoute } from './strategy-optimization-model-routing.js';

type ResolvedOptimizationRoute = ReturnType<AiProviderRegistry['strictReadyContract']>;

export type OptimizationSdkExecutionInput = {
  experiment: ExperimentRow;
  baseline: StrategySchemaV2;
  route: OptimizationModelRoute;
  modelKey: string;
  step: OptimizationStepRow;
  messages: unknown[];
  inputTokenReservation: number;
  outputTokenReservation: number;
  estimatedCost: number;
  resolved: ResolvedOptimizationRoute;
  requestTimeoutMs: number;
};

const decimalString = (value: number | string) => new Prisma.Decimal(value).toFixed();

const contractFor = (experiment: ExperimentRow) =>
  experiment.sourceMode === 'discovery'
    ? aiGenerationContracts.strategyDiscovery
    : aiGenerationContracts.parameterOptimization;

const paidBudgetAuthorized = (experiment: ExperimentRow) => {
  const maxCost = toRecord(experiment.budget).maxCost;
  if (typeof maxCost !== 'string') return false;
  try {
    return new Prisma.Decimal(maxCost).greaterThan(0);
  } catch {
    return false;
  }
};

const unknownCost = (source: string | null = null): AiCostFacts => ({
  status: 'unknown',
  amount: null,
  currency: null,
  source,
  pricingVersion: null,
});

const freeEvidenceCost = (reference: string) =>
  unknownCost(`free_evidence:${reference}`.slice(0, 120));

const reservationCost = (
  execution: AiProviderModelExecution,
  estimatedCost: number,
  metadata: ResolvedOptimizationRoute['provider']['metadata'],
): AiCostFacts => {
  if (execution.freeEvidenceRef) return freeEvidenceCost(execution.freeEvidenceRef);
  const currency = normalizeCostCurrency(metadata?.costCurrency);
  if (!currency) return unknownCost();
  return {
    status: 'estimated',
    amount: decimalString(estimatedCost),
    currency,
    source: 'frozen_provider_rates',
    pricingVersion: normalizePricingVersion(metadata?.pricingVersion),
  };
};

const completedCost = (
  providerCost: string | null,
  providerCurrency: string | null,
  usage: AiUsageFacts,
  metadata: ResolvedOptimizationRoute['provider']['metadata'],
  execution: AiProviderModelExecution,
): AiCostFacts => {
  const reportedCurrency = normalizeCostCurrency(providerCurrency);
  if (providerCost !== null && reportedCurrency)
    return {
      status: 'known',
      amount: decimalString(providerCost),
      currency: reportedCurrency,
      source: 'provider_reported',
      pricingVersion: normalizePricingVersion(metadata?.pricingVersion),
    };
  const currency = normalizeCostCurrency(metadata?.costCurrency);
  const inputRate = metadata?.costPer1kInput;
  const outputRate = metadata?.costPer1kOutput;
  if (
    usage.inputTokens !== null &&
    usage.outputTokens !== null &&
    currency &&
    typeof inputRate === 'number' &&
    typeof outputRate === 'number'
  )
    return {
      status: 'estimated',
      amount: decimalString(
        (usage.inputTokens * inputRate + usage.outputTokens * outputRate) / 1_000,
      ),
      currency,
      source: 'frozen_provider_rates',
      pricingVersion: normalizePricingVersion(metadata?.pricingVersion),
    };
  if (execution.freeEvidenceRef) return freeEvidenceCost(execution.freeEvidenceRef);
  return unknownCost('provider_usage_incomplete');
};

const persistenceFailure = (requestId: string, usage: AiUsageFacts, cause: unknown) =>
  new AiSdkGenerationError(
    aiGenerationErrorSchema.parse({
      code: 'persistence_failed',
      phase: 'persistence',
      summary: cause instanceof Error ? cause.message.slice(0, 500) : '优化结果保存失败',
      externalResult: 'complete',
      requestId,
    }),
    usage,
    { cause },
  );

@Injectable()
export class StrategyOptimizationSdkExecutor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AiProviderRegistry,
    private readonly adapter: AiSdkGenerationAdapter,
    private readonly executions: AiExecutionStateStore,
    private readonly settlements: StrategyOptimizationAiSettlementStore,
  ) {}

  resolveRoute(experiment: ExperimentRow, route: OptimizationModelRoute) {
    const resolved = this.providers.strictReadyContract({
      providerId: route.provider,
      model: route.model,
      contract: contractFor(experiment).ref,
      budgetAuthorized: paidBudgetAuthorized(experiment),
    });
    if (!resolved.provider.sdkRuntime) throw new Error('AI Provider 缺少 SDK 运行配置');
    return resolved;
  }

  private deadline(experiment: ExperimentRow) {
    const duration = toRecord(experiment.budget).maxDurationSeconds;
    if (typeof duration !== 'number') return null;
    return new Date(experiment.createdAt.getTime() + duration * 1_000);
  }

  private async initialize(input: OptimizationSdkExecutionInput, requestId: string) {
    const contract = contractFor(input.experiment).ref;
    const ownership = { runId: input.step.aiRunId!, executionAttempt: 1 };
    const initialized = await this.executions.initialize(ownership, {
      version: 'sdk-execution-v1',
      contract,
      frozenPolicy: null,
      deadlineAt: this.deadline(input.experiment)?.toISOString() ?? null,
      generationStatus: 'pending',
      usageCompleteness: 'unknown',
      requests: [],
      continuationBlockedReason: null,
    });
    if (!initialized) throw new Error('优化 AiRun 已失去执行权');
    const reservation = await this.executions.prepareRequest({
      ...ownership,
      requestId,
      reservation: {
        aiCalls: 1,
        inputTokens: input.inputTokenReservation,
        outputTokens: input.outputTokenReservation,
        cost: reservationCost(
          input.resolved.execution,
          input.estimatedCost,
          input.resolved.provider.metadata,
        ),
      },
    });
    if (!reservation) throw new Error('优化请求事实预留失败');
    if (!(await this.executions.authorizeDispatch(ownership, requestId)))
      throw new Error('优化请求未取得发送授权');
    return ownership;
  }

  private output(
    experiment: ExperimentRow,
    baseline: StrategySchemaV2,
    value: unknown,
  ): OptimizationProposal | OptimizationDiscoveryProposal {
    if (experiment.sourceMode === 'discovery')
      return assembleDiscoveryGeneration(experiment, baseline, value);
    return aiGenerationContracts.parameterOptimization.schema.parse(value);
  }

  private revision(input: { usage: AiUsageFacts; cost: AiCostFacts; recordedAt?: Date }) {
    return {
      revision: 1,
      usage: input.usage,
      cost: input.cost,
      recordedAt: (input.recordedAt ?? new Date()).toISOString(),
    };
  }

  private async settleKnownFailure(
    input: OptimizationSdkExecutionInput,
    requestId: string,
    error: AiSdkGenerationError,
    startedAt: number,
  ) {
    await this.settlements.completeAndSettle({
      runId: input.step.aiRunId!,
      executionAttempt: 1,
      requestId,
      attemptId: input.step.id,
      revision: this.revision({
        usage: error.usage,
        cost: completedCost(
          null,
          null,
          error.usage,
          input.resolved.provider.metadata,
          input.resolved.execution,
        ),
      }),
      outcome: {
        status: 'incomplete',
        finishReason: null,
        contract: contractFor(input.experiment).ref,
        schemaAccepted: false,
      },
      error: error.fact,
    });
    await markOptimizationKnownFailure(this.prisma, input.step, error, Date.now() - startedAt);
  }

  async completeProposal(input: OptimizationSdkExecutionInput) {
    if (!input.step.aiRunId) throw new Error('优化步骤缺少 AiRun');
    const requestId = randomUUID();
    const runtime = input.resolved.provider.sdkRuntime?.();
    if (!runtime) throw new Error('AI Provider 缺少 SDK 运行配置');
    const startedAt = Date.now();
    const ownership = await this.initialize(input, requestId);
    let generation: Awaited<ReturnType<AiSdkGenerationAdapter['generate']>> | undefined;
    try {
      generation = await optimizationModelConcurrency.withSlot(input.modelKey, () =>
        this.adapter.generate({
          requestId,
          adapter: input.resolved.execution.adapter,
          providerId: input.route.provider,
          baseURL: runtime.baseURL,
          apiKey: runtime.apiKey,
          model: input.route.model,
          messages: input.messages,
          contract: input.resolved.execution.contract,
          schema: contractFor(input.experiment).schema as z.ZodType<unknown>,
          mode: input.resolved.execution.mode,
          transport: 'stream',
          maxOutputTokens: input.outputTokenReservation,
          ...(input.route.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: input.route.reasoningEffort }),
          allowedUpstreams: input.resolved.execution.allowedUpstreams,
          timeout: {
            totalMs: Math.min(runtime.timeoutMs, input.requestTimeoutMs),
            firstChunkMs:
              input.resolved.execution.firstOutputTimeoutMs ??
              Math.min(90_000, input.requestTimeoutMs),
            chunkMs:
              input.resolved.execution.outputIdleTimeoutMs ??
              Math.min(45_000, input.requestTimeoutMs),
          },
          signal: AbortSignal.timeout(input.requestTimeoutMs),
        }),
      );
      const proposal = this.output(input.experiment, input.baseline, generation.output);
      const cost = completedCost(
        generation.providerCost,
        generation.providerCostCurrency,
        generation.usage,
        input.resolved.provider.metadata,
        input.resolved.execution,
      );
      let settled;
      try {
        settled = await this.settlements.completeAndSettle({
          ...ownership,
          requestId,
          attemptId: input.step.id,
          revision: this.revision({ usage: generation.usage, cost }),
          outcome: {
            status: 'complete',
            finishReason: generation.finishReason,
            contract: input.resolved.execution.contract,
            schemaAccepted: true,
          },
          checkpoint: {
            requestId,
            actualModel: generation.actualModel,
            rawFinishReason: generation.rawFinishReason,
            timeToFirstEventMs: generation.timeToFirstEventMs,
            timeToFirstTextMs: generation.timeToFirstTextMs,
          },
          result: proposal,
          proposal,
        });
      } catch (error) {
        throw persistenceFailure(requestId, generation.usage, error);
      }
      if (!settled)
        throw persistenceFailure(
          requestId,
          generation.usage,
          new Error('优化结果提交已失去执行权'),
        );
      return {
        proposal,
        aiRunId: input.step.aiRunId,
        modelKey: input.modelKey,
        continuationBlockedReason: settled.continuationBlockedReason,
      };
    } catch (error) {
      if (error instanceof AiSdkGenerationError) {
        if (error.fact.externalResult === 'unknown' || error.fact.code === 'persistence_failed') {
          await this.executions.markUnknown(ownership, requestId, error.fact);
          await markOptimizationUnknownOutcome(
            this.prisma,
            input.step,
            error,
            Date.now() - startedAt,
          );
        } else await this.settleKnownFailure(input, requestId, error, startedAt);
        throw error;
      }
      if (generation) {
        const businessError = new AiSdkGenerationError(
          aiGenerationErrorSchema.parse({
            code: 'business_invalid',
            phase: 'validation',
            summary: error instanceof Error ? error.message.slice(0, 500) : '策略候选校验失败',
            externalResult: 'complete',
            requestId,
          }),
          generation.usage,
          { cause: error },
        );
        await this.settleKnownFailure(input, requestId, businessError, startedAt);
        throw businessError;
      }
      const unknown = aiGenerationErrorSchema.parse({
        code: 'transport_unknown',
        phase: 'request',
        summary: error instanceof Error ? error.message.slice(0, 500) : 'Provider 请求结果未知',
        externalResult: 'unknown',
        requestId,
      });
      await this.executions.markUnknown(ownership, requestId, unknown);
      await markOptimizationUnknownOutcome(this.prisma, input.step, error, Date.now() - startedAt);
      throw error;
    }
  }
}
