import { z } from 'zod';
import {
  optimizationAdoptionContextSchema,
  optimizationCandidateSourceSchema,
  optimizationCostSummarySchema,
  optimizationDiscoveryScopeSchema,
  optimizationExperimentSourceSchema,
  optimizationReasoningEffortSchema,
  optimizationTradingCostReadModelSchema,
  resultReadEligibilitySchema,
  monitoringPlanSchema,
} from './strategy-optimization.js';
import { backtestRunSummaryReadSchema } from './backtest-management-wire.js';
import { strategyRiskDiffSchema } from './strategy-risk-wire.js';
import { aiExecutionReadModelSchema, aiUsageCompletenessSchema } from './ai-execution.js';

const record = z.record(z.string(), z.unknown());
const usage = z.number().nonnegative();
const cost = z.union([z.string(), z.number()]).nullable();
export const strategyOptimizationCapabilitiesReadSchema = z
  .object({
    riskApplicationsEnabled: z.boolean(),
    aiOptimizationEnabled: z.boolean(),
    providers: z.array(
      z
        .object({
          provider: z.string().min(1),
          model: z.string().min(1),
          costStatus: z.enum(['known', 'unknown']),
          costCurrency: z.string().optional(),
          pricingVersion: z.string().optional(),
          reasoning: z
            .object({
              supportedEfforts: z.array(optimizationReasoningEffortSchema).nullable().optional(),
              defaultEffort: optimizationReasoningEffortSchema.optional(),
              mandatory: z.boolean().optional(),
            })
            .optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const optimizationExperimentReadSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    nameSource: z.enum(['stored', 'legacy_fallback']),
    baselineStrategyVersionId: z.string(),
    status: z.string(),
    stage: z.string(),
    source: optimizationExperimentSourceSchema.optional(),
    sourceMode: z.enum(['existing', 'discovery']).optional(),
    discoveryScope: optimizationDiscoveryScopeSchema.nullable().optional(),
    strategySpaceVersion: z.string().nullable().optional(),
    objective: record,
    split: record,
    modelConfig: z.array(
      z
        .object({
          provider: z.string(),
          model: z.string(),
          costStatus: z.enum(['known', 'unknown']).optional(),
          costCurrency: z.string().optional(),
          pricingVersion: z.string().optional(),
          reasoningEffort: optimizationReasoningEffortSchema.optional(),
        })
        .passthrough(),
    ),
    aiCallsUsed: usage,
    backtestRunsUsed: usage,
    inputTokensUsed: usage,
    outputTokensUsed: usage,
    costUsed: cost,
    costSummary: optimizationCostSummarySchema,
    tradingCost: optimizationTradingCostReadModelSchema,
    selectedCandidateId: z.uuid().nullable().optional(),
    lockedCandidateIds: z.array(z.uuid()).nullable().optional(),
    testExposedAt: z.string().nullable().optional(),
    stopReason: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    runConfig: z.unknown().optional(),
    readEligibility: resultReadEligibilitySchema.optional(),
  })
  .passthrough();
export const optimizationCandidateReadSchema = z
  .object({
    id: z.uuid(),
    experimentId: z.uuid(),
    candidateNumber: z.number().int().nonnegative(),
    modelKey: z.string(),
    candidateStrategyVersionId: z.string(),
    executionHash: z.string(),
    proposal: record,
    diff: z.array(record),
    validationStatus: z.string(),
    runRefs: z.record(z.string(), z.string()),
    metrics: record,
    adoptedStrategyVersionId: z.string().nullable().optional(),
    validationScore: z.number().nullable().optional(),
    source: optimizationCandidateSourceSchema.optional(),
    readEligibility: resultReadEligibilitySchema.optional(),
  })
  .passthrough();
export const optimizationAttemptReadSchema = z
  .object({
    id: z.uuid(),
    experimentId: z.uuid(),
    modelKey: z.string(),
    attempt: z.number().int().nonnegative(),
    status: z.string(),
    createdAt: z.string(),
    aiRunId: z.string().nullable().optional(),
    proposal: z.unknown().optional(),
    error: z.string().nullable().optional(),
    inputTokens: usage.nullable().optional(),
    outputTokens: usage.nullable().optional(),
    cost: cost.optional(),
    durationMs: usage.nullable().optional(),
    modelMetadata: record.nullable().optional(),
    execution: aiExecutionReadModelSchema.nullable().optional(),
    usageCompleteness: aiUsageCompletenessSchema.optional(),
  })
  .passthrough();
export const optimizationDetailReadSchema = z
  .object({
    experiment: optimizationExperimentReadSchema,
    candidates: z.array(optimizationCandidateReadSchema),
    attempts: z.array(optimizationAttemptReadSchema),
  })
  .passthrough()
  .refine(
    (v) => [...v.candidates, ...v.attempts].every((x) => x.experimentId === v.experiment.id),
    { message: '实验结果归属不匹配' },
  );
export const optimizationCompareReadSchema = optimizationDetailReadSchema.safeExtend({
  baseline: z.object({ runRefs: z.record(z.string(), z.string()), metrics: record }),
  note: z.string(),
});
const pageInfo = z
  .object({ nextCursor: z.string().nullable(), hasNextPage: z.boolean() })
  .refine((v) => !v.hasNextPage || !!v.nextCursor, { message: '下一页缺少游标' });
export const optimizationPageReadSchema = z.object({
  items: z.array(optimizationExperimentReadSchema),
  totalCount: z.number().int().nonnegative(),
  pageInfo,
});
export const strategyBacktestGroupPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['user', 'experiment']),
      name: z.string(),
      experimentId: z.string().nullable(),
      experimentStage: z.string().nullable(),
      source: optimizationExperimentSourceSchema.nullable(),
      jobs: z.array(backtestRunSummaryReadSchema),
      members: z.array(
        z.object({
          jobId: z.string(),
          relation: z.enum(['user', 'baseline', 'candidate']),
          split: z.string().nullable(),
          candidateSource: optimizationCandidateSourceSchema.nullable(),
        }),
      ),
    }),
  ),
  totalCount: z.number().int().nonnegative(),
  pageInfo,
});
export const optimizationAdoptionReadSchema = z
  .object({
    strategyVersion: z.object({
      id: z.uuid(),
      strategyId: z.uuid(),
      version: z.number().int().positive(),
    }),
    adoptionContext: optimizationAdoptionContextSchema,
    monitoringPlan: monitoringPlanSchema,
    monitoringDiff: z
      .object({ before: monitoringPlanSchema.nullable(), after: monitoringPlanSchema })
      .optional(),
    riskApplicationEnabled: z.boolean(),
    riskApplicationDiffs: z.array(
      z.object({
        applicationId: z.uuid(),
        accountId: z.uuid(),
        symbol: z.string(),
        currentStrategyVersionId: z.uuid(),
        currentRevision: z.number().int().positive(),
        enabled: z.boolean(),
        diff: z.array(strategyRiskDiffSchema),
      }),
    ),
  })
  .passthrough();
export const optimizationListInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    search: z.string().optional(),
    sourceMode: z.enum(['existing', 'discovery']).optional(),
    status: z.string().optional(),
    strategyVersionId: z.uuid().optional(),
    jobId: z.string().optional(),
  })
  .strict();
export const strategyManagementIdSchema = z.uuid();
export type OptimizationExperimentRead = z.infer<typeof optimizationExperimentReadSchema>;
export type OptimizationDetailRead = z.infer<typeof optimizationDetailReadSchema>;
export type OptimizationCompareRead = z.infer<typeof optimizationCompareReadSchema>;
export type OptimizationPageRead = z.infer<typeof optimizationPageReadSchema>;
export type OptimizationAdoptionRead = z.infer<typeof optimizationAdoptionReadSchema>;
export type OptimizationListInput = z.infer<typeof optimizationListInputSchema>;
export type StrategyOptimizationCapabilitiesRead = z.infer<
  typeof strategyOptimizationCapabilitiesReadSchema
>;
