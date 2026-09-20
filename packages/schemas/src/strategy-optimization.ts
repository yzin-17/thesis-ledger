import { z } from 'zod';
import {
  assetSymbolRefSchema,
  backtestTimeframeSchema,
  booleanExpressionSchemaV2,
  riskRuleSchemaV2,
  runConfigSchemaV2,
  seriesFieldSchema,
  sizingRuleSchemaV2,
  strategySchemaV2,
} from './backtest-v2.js';
import { decimalStringSchema, nonNegativeDecimalStringSchema } from './ledger-v2.js';

export const strategyParameterIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_.:-]+$/);

export const strategyParameterDescriptorSchema = z
  .object({
    parameterId: strategyParameterIdSchema,
    label: z.string().trim().min(1).max(120),
    valueType: z.enum(['decimal', 'integer']),
    unit: z.enum(['ratio', 'periods', 'amount', 'quantity']),
    currentValue: z.union([decimalStringSchema, z.number().int().nonnegative()]),
    target: z
      .object({
        kind: z.enum(['risk', 'sizing', 'cost']),
        index: z.number().int().nonnegative().optional(),
        field: z.string().trim().min(1),
      })
      .strict(),
    schemaRange: z
      .object({
        min: z.union([decimalStringSchema, z.number().int().nonnegative()]),
        max: z.union([decimalStringSchema, z.number().int().nonnegative()]),
      })
      .strict()
      .optional(),
    optimizationRange: z
      .object({
        min: z.union([decimalStringSchema, z.number().int().nonnegative()]),
        max: z.union([decimalStringSchema, z.number().int().nonnegative()]),
        step: z.union([decimalStringSchema, z.number().int().positive()]).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type StrategyParameterDescriptor = z.infer<typeof strategyParameterDescriptorSchema>;

export const monitoringRuleKindSchema = z.enum(['cost-stop', 'take-profit', 'max-holding-period']);
export const monitoringEvaluationStateSchema = z.enum([
  'triggered',
  'not_triggered',
  'unavailable',
  'not_applicable',
]);

export const monitoringRuleDefinitionSchema = z
  .object({
    sourceKey: z.string().trim().min(1).max(200),
    sourceRiskIndex: z.number().int().nonnegative(),
    semanticVersion: z.literal('strategy-monitoring-v1'),
    kind: monitoringRuleKindSchema,
    label: z.string().trim().min(1).max(160),
    metric: z.enum(['priceToAverageCostReturn', 'holdingPeriods']),
    operator: z.enum(['lte', 'gte']),
    threshold: decimalStringSchema,
    evaluationTimeframe: z.string().trim().min(1),
    costBasisPolicy: z.literal('account-projection-average-cost-including-known-fees'),
  })
  .strict();
export type MonitoringRuleDefinition = z.infer<typeof monitoringRuleDefinitionSchema>;

export const monitoringCoverageItemSchema = z
  .object({
    source: z.string().trim().min(1),
    category: z.enum(['risk', 'exit', 'sizing', 'entry']),
    status: z.enum(['mapped', 'not_risk', 'unsupported']),
    reason: z.string().trim().min(1),
  })
  .strict();

export const monitoringPlanSchema = z
  .object({
    semanticVersion: z.literal('strategy-monitoring-v1'),
    strategyVersionId: z.uuid().optional(),
    strategyHash: z.string().trim().min(1),
    planHash: z.string().trim().min(1),
    executionSymbol: z.string().trim().min(1),
    evaluationTimeframe: z.string().trim().min(1),
    rules: z.array(monitoringRuleDefinitionSchema),
    coverage: z
      .object({
        riskTotal: z.number().int().nonnegative(),
        riskMapped: z.number().int().nonnegative(),
        items: z.array(monitoringCoverageItemSchema),
      })
      .strict(),
  })
  .strict();
export type MonitoringPlan = z.infer<typeof monitoringPlanSchema>;

export const monitoringEvaluationSchema = z
  .object({
    sourceKey: z.string().trim().min(1),
    state: monitoringEvaluationStateSchema,
    value: decimalStringSchema.optional(),
    threshold: decimalStringSchema,
    reason: z.string().trim().min(1).optional(),
    occurredAt: z.iso.datetime({ offset: true }).optional(),
    availableAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export const riskApplicationCycleModeSchema = z.enum(['existingAndFuture', 'nextPositionCycle']);
export const riskApplicationPreviewInputSchema = z
  .object({
    strategyVersionId: z.uuid(),
    accountId: z.uuid(),
    symbol: z.string().trim().min(1),
    cycleMode: riskApplicationCycleModeSchema.default('existingAndFuture'),
  })
  .strict();

export const riskApplicationNotificationSchema = z
  .object({
    enabled: z.boolean().default(true),
    cooldownMinutes: z.number().int().min(0).max(10_080).default(60),
    severity: z.enum(['info', 'warning', 'error', 'critical']).default('warning'),
    channels: z
      .array(z.enum(['feishu']))
      .max(1)
      .default([]),
  })
  .strict();

export const riskApplicationCreateSchema = riskApplicationPreviewInputSchema
  .extend({
    previewHash: z.string().trim().min(1),
    idempotencyKey: z.string().trim().min(1).max(200),
    enabled: z.boolean().default(false),
    notification: riskApplicationNotificationSchema.default({
      enabled: true,
      cooldownMinutes: 60,
      severity: 'warning',
      channels: [],
    }),
  })
  .strict();

export const riskApplicationUpdateSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    enabled: z.boolean().optional(),
    notification: riskApplicationNotificationSchema.optional(),
  })
  .strict();

export const riskApplicationArchiveSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
  })
  .strict();

export const riskApplicationUpgradeSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    targetStrategyVersionId: z.uuid(),
    previewHash: z.string().trim().min(1),
    idempotencyKey: z.string().trim().min(1).max(200),
  })
  .strict();

export const optimizationReasoningEffortSchema = z.enum([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);
export type OptimizationReasoningEffort = z.infer<typeof optimizationReasoningEffortSchema>;

export const optimizationModelSchema = z
  .object({
    provider: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(200),
    reasoningEffort: optimizationReasoningEffortSchema.optional(),
  })
  .strict();

export const optimizationCostStatusSchema = z.enum(['known', 'unknown']);
export type OptimizationCostStatus = z.infer<typeof optimizationCostStatusSchema>;

/** 服务端在实验创建时冻结的 Provider/Model 费用事实；不是客户端可提交的模型选择。 */
export const optimizationModelConfigSnapshotSchema = z
  .object({
    provider: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(200),
    reasoningEffort: optimizationReasoningEffortSchema.optional(),
    costStatus: optimizationCostStatusSchema,
    costCurrency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/u)
      .transform((value) => value.toUpperCase())
      .optional(),
    pricingVersion: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.costStatus === 'known' && !value.costCurrency)
      ctx.addIssue({ code: 'custom', path: ['costCurrency'], message: '已知费用必须带计费币种' });
  });
export type OptimizationModelConfigSnapshot = z.infer<typeof optimizationModelConfigSnapshotSchema>;

export const optimizationObjectiveSchema = z
  .object({
    mode: z.enum(['return', 'drawdown', 'balanced', 'lowTurnover']),
    maxDrawdown: nonNegativeDecimalStringSchema.optional(),
    minClosedTrades: z.number().int().nonnegative().default(1),
  })
  .strict();

const splitWindowSchema = z
  .object({ start: z.iso.date(), end: z.iso.date() })
  .strict()
  .superRefine((value, ctx) => {
    if (value.start > value.end)
      ctx.addIssue({ code: 'custom', path: ['end'], message: '区间结束时间必须不早于开始时间' });
  });

export const optimizationSplitSchema = z
  .object({
    development: splitWindowSchema,
    validation: splitWindowSchema,
    test: splitWindowSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.development.end >= value.validation.start)
      ctx.addIssue({
        code: 'custom',
        path: ['validation', 'start'],
        message: '验证集必须晚于开发集',
      });
    if (value.validation.end >= value.test.start)
      ctx.addIssue({ code: 'custom', path: ['test', 'start'], message: '测试集必须晚于验证集' });
  });

export const optimizationBudgetSchema = z
  .object({
    maxAiCalls: z.number().int().min(1).max(30),
    maxBacktestRuns: z.number().int().min(2).max(100),
    maxInputTokens: z.number().int().min(1).max(10_000_000).default(100_000),
    maxOutputTokens: z.number().int().min(1).max(2_000_000).default(20_000),
    maxCost: nonNegativeDecimalStringSchema.optional(),
    maxDurationSeconds: z.number().int().min(30).max(86_400).default(1_800),
  })
  .strict();

export const optimizationCostErrorCodeSchema = z.enum([
  'OPTIMIZATION_COST_MIXED_CURRENCY',
  'OPTIMIZATION_COST_UNKNOWN_CONFIRMATION_REQUIRED',
  'OPTIMIZATION_COST_TOTAL_LIMIT_UNAVAILABLE',
  'OPTIMIZATION_COST_CONFIRMATION_STALE',
  'OPTIMIZATION_COST_CURRENCY_MISMATCH',
]);
export type OptimizationCostErrorCode = z.infer<typeof optimizationCostErrorCodeSchema>;

export const optimizationCostSummarySchema = z
  .object({
    status: z.enum(['complete', 'partial', 'unavailable', 'mixed_currency']),
    currency: z.string().nullable(),
    knownAmount: nonNegativeDecimalStringSchema.nullable(),
    knownByCurrency: z
      .array(
        z
          .object({
            currency: z.string().min(1),
            amount: nonNegativeDecimalStringSchema,
          })
          .strict(),
      )
      .max(32),
    reason: z
      .enum(['unknown_cost', 'unknown_currency', 'historical_missing_metadata', 'mixed_currency'])
      .nullable(),
  })
  .strict();
export type OptimizationCostSummary = z.infer<typeof optimizationCostSummarySchema>;

export const optimizationTradingCostDisclosureSchema = z
  .object({
    source: z.literal('frozen_seed'),
    commissionRate: nonNegativeDecimalStringSchema,
    slippageRate: nonNegativeDecimalStringSchema,
    assumption: z.enum(['configured', 'zero_assumption']),
  })
  .strict()
  .superRefine((value, context) => {
    const isZero = (amount: string) => /^0+(?:\.0+)?$/u.test(amount);
    const zero = isZero(value.commissionRate) && isZero(value.slippageRate);
    if ((value.assumption === 'zero_assumption') !== zero)
      context.addIssue({
        code: 'custom',
        path: ['assumption'],
        message: 'zero_assumption 只适用于佣金和滑点均为零的冻结 seed',
      });
  });
export type OptimizationTradingCostDisclosure = z.infer<
  typeof optimizationTradingCostDisclosureSchema
>;

export const optimizationSourceModeSchema = z.enum(['existing', 'discovery']);
export type OptimizationSourceMode = z.infer<typeof optimizationSourceModeSchema>;

export const optimizationExperimentNameSchema = z.string().trim().min(1).max(120);

/** 用户输入的探索边界；strategySpaceVersion 由 Server 固定，不接受客户端覆盖。 */
export const optimizationDiscoveryScopeSchema = z
  .object({
    executionInstrument: assetSymbolRefSchema,
    primaryTimeframe: backtestTimeframeSchema,
  })
  .strict();
export type OptimizationDiscoveryScope = z.infer<typeof optimizationDiscoveryScopeSchema>;

export const optimizationExperimentSourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('existing'),
      strategyId: z.uuid(),
      strategyVersionId: z.uuid(),
      strategyName: z.string().trim().min(1).nullable(),
      version: z.number().int().positive(),
      schemaVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('discovery'),
      experimentId: z.uuid(),
      strategySpaceVersion: z.string().trim().min(1).nullable(),
      discoveryScope: optimizationDiscoveryScopeSchema.nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('unknown'),
      reason: z.enum(['missing_baseline', 'missing_source', 'missing_candidate']),
      referenceId: z.string().trim().min(1).nullable(),
    })
    .strict(),
]);
export type OptimizationExperimentSource = z.infer<typeof optimizationExperimentSourceSchema>;

export const optimizationTradingCostReadModelSchema = z
  .object({
    source: z.enum(['baseline_strategy', 'discovery_seed', 'unavailable']),
    commissionRate: nonNegativeDecimalStringSchema.nullable(),
    slippageRate: nonNegativeDecimalStringSchema.nullable(),
    isAssumption: z.literal(true),
    zeroDoesNotMeanFree: z.boolean(),
  })
  .strict();
export type OptimizationTradingCostReadModel = z.infer<
  typeof optimizationTradingCostReadModelSchema
>;

export const optimizationCandidateSourceSchema = z
  .object({
    kind: z.literal('candidate'),
    experimentId: z.uuid(),
    candidateId: z.uuid(),
    candidateStrategyVersionId: z.uuid(),
    candidateNumber: z.number().int().positive(),
    stage: z.string().trim().min(1),
  })
  .strict();
export type OptimizationCandidateSource = z.infer<typeof optimizationCandidateSourceSchema>;

/** 模型只生成可变策略部分；固定标的、周期、执行、成本和 SignalSource ID 由服务端装配。 */
export const optimizationDiscoveryGeneratedStrategySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    series: z.array(seriesFieldSchema).min(1).max(6),
    entry: booleanExpressionSchemaV2,
    exit: booleanExpressionSchemaV2,
    sizing: sizingRuleSchemaV2,
    risk: z.array(riskRuleSchemaV2).max(32),
  })
  .strict();

export const optimizationDiscoveryGenerationOutputSchema = z
  .object({
    strategy: optimizationDiscoveryGeneratedStrategySchema,
    reason: z.string().trim().min(1).max(2_000).optional(),
    evidenceRefs: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  })
  .strict();
export type OptimizationDiscoveryGenerationOutput = z.infer<
  typeof optimizationDiscoveryGenerationOutputSchema
>;

export const optimizationDiscoveryProposalSchema = z
  .object({
    strategy: strategySchemaV2,
    reason: z.string().trim().min(1).max(2_000).optional(),
    evidenceRefs: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  })
  .strict();
export type OptimizationDiscoveryProposal = z.infer<typeof optimizationDiscoveryProposalSchema>;

export const optimizationExperimentCreateSchema = z
  .object({
    name: optimizationExperimentNameSchema.optional(),
    sourceMode: optimizationSourceModeSchema.default('existing'),
    strategyVersionId: z.uuid().optional(),
    discoveryScope: optimizationDiscoveryScopeSchema.optional(),
    models: z.array(optimizationModelSchema).min(1).max(3),
    allowedParameterIds: z.array(strategyParameterIdSchema).min(1).max(64).optional(),
    objective: optimizationObjectiveSchema,
    split: optimizationSplitSchema,
    runConfig: runConfigSchemaV2,
    budget: optimizationBudgetSchema,
    maxRounds: z.number().int().min(1).max(3).default(2),
    acknowledgeUnknownCost: z.boolean().default(false),
    idempotencyKey: z.string().trim().min(1).max(200),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.sourceMode === 'existing' &&
      (!value.strategyVersionId || !value.allowedParameterIds || value.discoveryScope)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['strategyVersionId'],
        message: '现有策略优化必须选择正式策略版本和参数',
      });
    }
    if (
      value.sourceMode === 'discovery' &&
      (!value.discoveryScope || value.strategyVersionId || value.allowedParameterIds)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['discoveryScope'],
        message: '从零探索只能提供探索边界，不能携带策略版本或参数授权',
      });
    }
    if (
      value.sourceMode === 'discovery' &&
      value.discoveryScope?.executionInstrument.assetType === 'fund' &&
      (value.discoveryScope.executionInstrument.market !== 'CN' ||
        value.discoveryScope.primaryTimeframe !== '1d')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['discoveryScope'],
        message: 'NAV 基金探索只支持 CN 日频',
      });
    }
    const modelKeys = value.models.map((item) => JSON.stringify([item.provider, item.model]));
    if (new Set(modelKeys).size !== modelKeys.length)
      ctx.addIssue({ code: 'custom', path: ['models'], message: 'Provider + model 必须唯一' });
    if (
      value.allowedParameterIds &&
      new Set(value.allowedParameterIds).size !== value.allowedParameterIds.length
    )
      ctx.addIssue({ code: 'custom', path: ['allowedParameterIds'], message: '参数授权不得重复' });
    const plannedAiCalls = value.models.length * value.maxRounds;
    const plannedBacktestRuns = 3 + value.models.length * (value.maxRounds * 2 + 1);
    if (value.budget.maxAiCalls < plannedAiCalls)
      ctx.addIssue({
        code: 'custom',
        path: ['budget', 'maxAiCalls'],
        message: `AI 调用预算至少需要 ${plannedAiCalls} 次以保证各模型同额度`,
      });
    if (value.budget.maxBacktestRuns < plannedBacktestRuns)
      ctx.addIssue({
        code: 'custom',
        path: ['budget', 'maxBacktestRuns'],
        message: `回测预算至少需要 ${plannedBacktestRuns} 次以预留最终验证`,
      });
    const splitStart = value.split.development.start;
    const splitEnd = value.split.test.end;
    if (splitStart < value.runConfig.startDate || splitEnd > value.runConfig.endDate)
      ctx.addIssue({
        code: 'custom',
        path: ['split'],
        message: '数据切分必须位于 RunConfig 区间内',
      });
  });
export type OptimizationExperimentCreate = z.infer<typeof optimizationExperimentCreateSchema>;
export type OptimizationExperimentClone = z.infer<typeof optimizationExperimentCloneSchema>;

export const optimizationProposalChangeSchema = z
  .object({
    parameterId: strategyParameterIdSchema,
    value: z.union([decimalStringSchema, z.number().int().nonnegative()]),
  })
  .strict();
export const optimizationProposalSchema = z
  .object({
    changes: z.array(optimizationProposalChangeSchema).min(1).max(32),
    reason: z.string().trim().min(1).max(2_000),
    evidenceRefs: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.changes.map((change) => change.parameterId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', path: ['changes'], message: '同一提案不能重复修改同一参数' });
  });
export type OptimizationProposal = z.infer<typeof optimizationProposalSchema>;

export const optimizationExperimentStatusSchema = z.enum([
  'queued',
  'running',
  'awaiting_finalization',
  'testing',
  'succeeded',
  'failed',
  'cancelled',
]);
export const optimizationExperimentStageSchema = z.enum([
  'preparing',
  'baseline',
  'proposing',
  'evaluating',
  'awaiting_finalization',
  'testing',
  'completed',
  'failed',
  'cancelled',
]);

export const optimizationExperimentCloneSchema = z
  .object({
    name: optimizationExperimentNameSchema.optional(),
    acknowledgeUnknownCost: z.boolean().optional(),
    idempotencyKey: z.string().trim().min(1).max(200),
  })
  .strict();

export const optimizationExperimentRenameSchema = z
  .object({ name: optimizationExperimentNameSchema })
  .strict();

export const optimizationFinalizeSchema = z
  .object({
    candidateIds: z.array(z.uuid()).min(1).max(3),
    selectedCandidateId: z.uuid(),
    expectedStage: z.literal('awaiting_finalization'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.candidateIds.includes(value.selectedCandidateId))
      ctx.addIssue({
        code: 'custom',
        path: ['selectedCandidateId'],
        message: '预选候选必须位于锁定集合中',
      });
  });

export const optimizationAdoptSchema = z
  .object({
    candidateId: z.uuid(),
    candidateHash: z.string().trim().min(1),
    expectedStrategyVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().trim().min(1).max(200),
    acknowledgeTestExposure: z.boolean().default(false),
  })
  .strict();

export const optimizationAdoptionErrorCodeSchema = z.enum([
  'ADOPTION_NOT_REVEALED',
  'ADOPTION_NOT_ELIGIBLE',
  'ADOPTION_CANDIDATE_HASH_MISMATCH',
  'ADOPTION_SOURCE_MISMATCH',
  'ADOPTION_STALE_BASELINE',
  'ADOPTION_ALREADY_COMMITTED',
  'ADOPTION_IDEMPOTENCY_CONFLICT',
]);
export type OptimizationAdoptionErrorCode = z.infer<typeof optimizationAdoptionErrorCodeSchema>;

export const optimizationAdoptionVersionSnapshotSchema = z
  .object({
    id: z.uuid(),
    strategyId: z.uuid(),
    version: z.number().int(),
    schemaVersion: z.number().int(),
    schema: strategySchemaV2,
  })
  .strict();
export type OptimizationAdoptionVersionSnapshot = z.infer<
  typeof optimizationAdoptionVersionSnapshotSchema
>;

export const optimizationAdoptionDiffEntrySchema = z
  .object({
    path: z.string().min(1),
    before: z.unknown(),
    after: z.unknown(),
  })
  .strict();
export type OptimizationAdoptionDiffEntry = z.infer<typeof optimizationAdoptionDiffEntrySchema>;

export const optimizationAdoptionContextSchema = z
  .object({
    experimentId: z.uuid(),
    candidateId: z.uuid(),
    expectedStrategyVersion: z.number().int().nonnegative(),
    baseline: optimizationAdoptionVersionSnapshotSchema,
    current: optimizationAdoptionVersionSnapshotSchema.nullable(),
    candidate: optimizationAdoptionVersionSnapshotSchema.extend({
      candidateId: z.uuid(),
      executionHash: z.string().min(1),
    }),
    candidateVsBaseline: z.array(optimizationAdoptionDiffEntrySchema),
    candidateVsCurrent: z.array(optimizationAdoptionDiffEntrySchema),
  })
  .strict();
export type OptimizationAdoptionContext = z.infer<typeof optimizationAdoptionContextSchema>;

export const strategyOptimizationCapabilitiesSchema = z
  .object({
    riskApplicationsEnabled: z.boolean(),
    aiOptimizationEnabled: z.boolean(),
    providers: z.array(optimizationModelSchema),
  })
  .strict();

/**
 * 结果读取授权是独立于任务状态的事实：testExposedAt 只表示已发生访问，
 * 只有 exposure.testRevealed=true 才能读取测试结果。
 */
export const resultReadEligibilityCodeSchema = z.enum([
  'READABLE',
  'TEST_NOT_REVEALED',
  'HISTORICAL_REVEAL_UNKNOWN',
  'RUN_NOT_ASSOCIATED',
]);
export type ResultReadEligibilityCode = z.infer<typeof resultReadEligibilityCodeSchema>;

export const resultReadEligibilitySchema = z
  .object({
    state: z.enum(['readable', 'restricted']),
    code: resultReadEligibilityCodeSchema,
    scope: z.enum(['none', 'test']),
    accessedAt: z.string().nullable(),
    revealedAt: z.string().nullable(),
  })
  .strict();
export type ResultReadEligibility = z.infer<typeof resultReadEligibilitySchema>;

const resultReadDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && !Number.isNaN(new Date(value).getTime())) return value;
  return null;
};

/** 只接受显式揭示证据；缺失或非布尔值按历史证据不明处理。 */
export const resultReadEligibilityForExperiment = (input: {
  exposure?: unknown;
  testExposedAt?: unknown;
}): ResultReadEligibility => {
  const exposure =
    input.exposure && typeof input.exposure === 'object' && !Array.isArray(input.exposure)
      ? (input.exposure as Record<string, unknown>)
      : {};
  const testRevealed = exposure.testRevealed;
  const accessedAt = resultReadDate(input.testExposedAt);
  const revealedAt = resultReadDate(exposure.testRevealedAt);
  if (testRevealed === true) {
    return {
      state: 'readable',
      code: 'READABLE',
      scope: 'none',
      accessedAt,
      revealedAt,
    };
  }
  return {
    state: 'restricted',
    code: testRevealed === false ? 'TEST_NOT_REVEALED' : 'HISTORICAL_REVEAL_UNKNOWN',
    scope: 'test',
    accessedAt,
    revealedAt,
  };
};

export const resultReadEligibilityForRun = (input: {
  split?: string | null;
  exposure?: unknown;
  testExposedAt?: unknown;
  associated?: boolean;
  ordinaryFormal?: boolean;
}): ResultReadEligibility => {
  if (!input.associated && input.ordinaryFormal)
    return {
      state: 'readable',
      code: 'RUN_NOT_ASSOCIATED',
      scope: 'none',
      accessedAt: null,
      revealedAt: null,
    };
  if (!input.associated)
    return {
      state: 'restricted',
      code: 'HISTORICAL_REVEAL_UNKNOWN',
      scope: 'test',
      accessedAt: null,
      revealedAt: null,
    };
  if (input.split !== 'test')
    return {
      state: 'readable',
      code: 'READABLE',
      scope: 'none',
      accessedAt: resultReadDate(input.testExposedAt),
      revealedAt: null,
    };
  return resultReadEligibilityForExperiment(input);
};
