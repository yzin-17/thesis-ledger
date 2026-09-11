import { z } from 'zod';
import { runConfigSchemaV2 } from './backtest-v2.js';
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

export const monitoringRuleKindSchema = z.enum([
  'cost-stop',
  'take-profit',
  'max-holding-period',
]);
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
    channels: z.array(z.enum(['feishu'])).max(1).default(['feishu']),
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
      channels: ['feishu'],
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

export const riskApplicationUpgradeSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    targetStrategyVersionId: z.uuid(),
    previewHash: z.string().trim().min(1),
    idempotencyKey: z.string().trim().min(1).max(200),
  })
  .strict();

export const optimizationModelSchema = z
  .object({
    provider: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(200),
  })
  .strict();

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
      ctx.addIssue({ code: 'custom', path: ['validation', 'start'], message: '验证集必须晚于开发集' });
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

export const optimizationExperimentCreateSchema = z
  .object({
    strategyVersionId: z.uuid(),
    models: z.array(optimizationModelSchema).min(1).max(3),
    allowedParameterIds: z.array(strategyParameterIdSchema).min(1).max(64),
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
    const modelKeys = value.models.map((item) => `${item.provider}:${item.model}`);
    if (new Set(modelKeys).size !== modelKeys.length)
      ctx.addIssue({ code: 'custom', path: ['models'], message: 'Provider + model 必须唯一' });
    if (new Set(value.allowedParameterIds).size !== value.allowedParameterIds.length)
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
      ctx.addIssue({ code: 'custom', path: ['split'], message: '数据切分必须位于 RunConfig 区间内' });
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
  .object({ idempotencyKey: z.string().trim().min(1).max(200) })
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
      ctx.addIssue({ code: 'custom', path: ['selectedCandidateId'], message: '预选候选必须位于锁定集合中' });
  });

export const optimizationAdoptSchema = z
  .object({
    candidateId: z.uuid(),
    candidateHash: z.string().trim().min(1),
    expectedStrategyVersion: z.number().int().positive(),
    idempotencyKey: z.string().trim().min(1).max(200),
    acknowledgeTestExposure: z.boolean().default(false),
  })
  .strict();

export const strategyOptimizationCapabilitiesSchema = z
  .object({
    riskApplicationsEnabled: z.boolean(),
    aiOptimizationEnabled: z.boolean(),
    providers: z.array(optimizationModelSchema),
  })
  .strict();
