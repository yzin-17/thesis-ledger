import { z } from 'zod';
import { nonNegativeDecimalStringSchema } from './ledger-v2.js';
import { aiResearchContextSchema, aiResearchTemplateIdSchema } from './ai.js';
import {
  optimizationDiscoveryGenerationOutputSchema,
  optimizationProposalSchema,
} from './strategy-optimization.js';

export const AI_PARAMETER_OPTIMIZATION_CONTRACT_VERSION = 'optimization-parameter-v1' as const;
export const AI_STRATEGY_DISCOVERY_CONTRACT_VERSION = 'strategy-discovery-v2' as const;
export const AI_RESEARCH_GENERATION_CONTRACT_VERSION = 'research-generation-v1' as const;

export const aiLegacyAdapterSchema = z.enum(['openrouter', 'openai-compatible']);
export type AiLegacyAdapter = z.infer<typeof aiLegacyAdapterSchema>;

export const aiAdapterSchema = z.enum([
  ...aiLegacyAdapterSchema.options,
  'openai-compatible-chat',
  'openai-chat',
  'openai-responses',
  'anthropic-messages',
]);
export type AiAdapter = z.infer<typeof aiAdapterSchema>;

export const aiGenerationModeSchema = z.enum(['native_schema', 'json_validated']);
export type AiGenerationMode = z.infer<typeof aiGenerationModeSchema>;

export const aiAuthModeSchema = z.enum(['api_key', 'none']);
export type AiAuthMode = z.infer<typeof aiAuthModeSchema>;

export const aiProviderTestKindSchema = z.enum(['connection', 'generation']);
export type AiProviderTestKind = z.infer<typeof aiProviderTestKindSchema>;

export const aiResearchDefaultSchema = z
  .object({
    providerId: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type AiResearchDefault = z.infer<typeof aiResearchDefaultSchema>;

export const aiRoutingSettingsSchema = z
  .object({
    researchDefault: aiResearchDefaultSchema.nullable(),
    revision: z.string().trim().min(1).max(120),
  })
  .strict();
export type AiRoutingSettings = z.infer<typeof aiRoutingSettingsSchema>;

export const aiGenerationContractRefSchema = z.discriminatedUnion('id', [
  z
    .object({
      id: z.literal('parameter_optimization'),
      version: z.literal(AI_PARAMETER_OPTIMIZATION_CONTRACT_VERSION),
    })
    .strict(),
  z
    .object({
      id: z.literal('strategy_discovery'),
      version: z.literal(AI_STRATEGY_DISCOVERY_CONTRACT_VERSION),
    })
    .strict(),
  z
    .object({
      id: z.literal('research'),
      version: z.literal(AI_RESEARCH_GENERATION_CONTRACT_VERSION),
    })
    .strict(),
]);
export type AiGenerationContractRef = z.infer<typeof aiGenerationContractRefSchema>;

export const aiParameterOptimizationGenerationSchema = optimizationProposalSchema;
export const aiStrategyDiscoveryGenerationSchema = optimizationDiscoveryGenerationOutputSchema;

export const aiResearchGenerationCitationSchema = z
  .object({
    toolCallId: z.uuid().optional(),
    tool: z.string().trim().min(1).max(120).optional(),
    sourceId: z.string().trim().min(1).max(240).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.toolCallId || value.sourceId),
    '研究引用必须提供 toolCallId 或 sourceId',
  );

export const aiResearchGenerationSchema = z
  .object({
    conclusion: z.string().trim().min(1).max(20_000),
    evidence: z
      .array(
        z
          .object({
            claim: z.string().trim().min(1).max(4_000),
            citations: z.array(aiResearchGenerationCitationSchema).min(1).max(20),
          })
          .strict(),
      )
      .max(100),
    risks: z.array(z.string().trim().min(1).max(2_000)).max(100),
    unknowns: z.array(z.string().trim().min(1).max(2_000)).max(100),
    disclaimer: z.string().trim().min(1).max(2_000),
    symbol: z.string().trim().min(1).max(120).optional(),
    score: z.number().min(0).max(100).optional(),
    signals: z.array(z.string().trim().min(1).max(1_000)).max(100).default([]),
  })
  .strict();
export type AiResearchGeneration = z.infer<typeof aiResearchGenerationSchema>;

export const aiGenerationContracts = {
  parameterOptimization: {
    ref: {
      id: 'parameter_optimization',
      version: AI_PARAMETER_OPTIMIZATION_CONTRACT_VERSION,
    } satisfies AiGenerationContractRef,
    schema: aiParameterOptimizationGenerationSchema,
  },
  strategyDiscovery: {
    ref: {
      id: 'strategy_discovery',
      version: AI_STRATEGY_DISCOVERY_CONTRACT_VERSION,
    } satisfies AiGenerationContractRef,
    schema: aiStrategyDiscoveryGenerationSchema,
  },
  research: {
    ref: {
      id: 'research',
      version: AI_RESEARCH_GENERATION_CONTRACT_VERSION,
    } satisfies AiGenerationContractRef,
    schema: aiResearchGenerationSchema,
  },
} as const;

export const aiGenerationErrorCodeSchema = z.enum([
  'configuration_invalid',
  'capability_unsupported',
  'authentication_failed',
  'permission_denied',
  'payment_required',
  'provider_rejected',
  'transport_unknown',
  'provider_stream_error',
  'output_truncated',
  'empty_output',
  'refused',
  'schema_invalid',
  'business_invalid',
  'cancelled',
  'persistence_failed',
]);
export type AiGenerationErrorCode = z.infer<typeof aiGenerationErrorCodeSchema>;

export const aiGenerationPhaseSchema = z.enum([
  'configuration',
  'preflight',
  'request',
  'response_headers',
  'stream',
  'validation',
  'persistence',
  'settlement',
  'cancellation',
]);

export const aiExternalResultCertaintySchema = z.enum([
  'not_sent',
  'rejected_before_generation',
  'unknown',
  'complete',
]);

export const aiGenerationErrorSchema = z
  .object({
    code: aiGenerationErrorCodeSchema,
    phase: aiGenerationPhaseSchema,
    summary: z.string().trim().min(1).max(500),
    externalResult: aiExternalResultCertaintySchema,
    requestId: z.uuid().nullable().default(null),
    retryAfterMs: z.number().int().nonnegative().max(86_400_000).optional(),
  })
  .strict();
export type AiGenerationError = z.infer<typeof aiGenerationErrorSchema>;

export const aiUsageStatusSchema = z.enum(['reported', 'partial', 'unknown']);
export const aiUsageCompletenessSchema = z.enum([
  'reported',
  'partial',
  'unknown',
  'legacy_unknown',
]);
export type AiUsageCompleteness = z.infer<typeof aiUsageCompletenessSchema>;

export const aiUsageFactsSchema = z
  .object({
    status: aiUsageStatusSchema,
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const known = Number(value.inputTokens !== null) + Number(value.outputTokens !== null);
    if (value.status === 'reported' && known !== 2)
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'reported 必须包含完整 Token',
      });
    if (value.status === 'partial' && known !== 1)
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'partial 必须且只能缺失一项 Token',
      });
    if (value.status === 'unknown' && known !== 0)
      context.addIssue({ code: 'custom', path: ['status'], message: 'unknown 不得伪造 Token' });
  });
export type AiUsageFacts = z.infer<typeof aiUsageFactsSchema>;

export const aiCostFactsSchema = z
  .object({
    status: z.enum(['known', 'estimated', 'unknown']),
    amount: nonNegativeDecimalStringSchema.nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/u)
      .nullable(),
    source: z.string().trim().min(1).max(120).nullable(),
    pricingVersion: z.string().trim().min(1).max(120).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status !== 'unknown' && (!value.amount || !value.currency || !value.source)) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: '已知或估算费用必须包含金额、币种和来源',
      });
    }
    if (value.status === 'unknown' && value.amount !== null)
      context.addIssue({ code: 'custom', path: ['amount'], message: '未知费用不得携带确定金额' });
  });
export type AiCostFacts = z.infer<typeof aiCostFactsSchema>;

export const aiGenerationOutcomeSchema = z
  .object({
    status: z.enum(['complete', 'incomplete']),
    finishReason: z.string().trim().min(1).max(120).nullable(),
    contract: aiGenerationContractRefSchema,
    schemaAccepted: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'complete' && !value.schemaAccepted)
      context.addIssue({
        code: 'custom',
        path: ['schemaAccepted'],
        message: '完整结果必须通过生成 Schema',
      });
  });
export type AiGenerationOutcome = z.infer<typeof aiGenerationOutcomeSchema>;

export const aiRequestReservationSchema = z
  .object({
    aiCalls: z.literal(1),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cost: aiCostFactsSchema,
    provider: z.string().trim().min(1).max(120).optional(),
    model: z.string().trim().min(1).max(200).optional(),
    configurationFingerprint: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const aiUsageRevisionSchema = z
  .object({
    revision: z.number().int().positive(),
    usage: aiUsageFactsSchema,
    cost: aiCostFactsSchema,
    recordedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const aiRequestAttemptSchema = z
  .object({
    requestId: z.uuid(),
    sequence: z.number().int().positive(),
    state: z.enum(['prepared', 'dispatching', 'completed', 'unknown']),
    reservation: aiRequestReservationSchema,
    dispatchExecutionAttempt: z.number().int().positive().nullable(),
    preparedAt: z.iso.datetime({ offset: true }),
    dispatchingAt: z.iso.datetime({ offset: true }).nullable(),
    completedAt: z.iso.datetime({ offset: true }).nullable(),
    outcome: aiGenerationOutcomeSchema.nullable(),
    error: aiGenerationErrorSchema.nullable(),
    usageRevisions: z.array(aiUsageRevisionSchema).max(16),
    settledRevision: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    const revisionsAreSequential = value.usageRevisions.every(
      (revision, index) => revision.revision === index + 1,
    );
    if (!revisionsAreSequential)
      context.addIssue({
        code: 'custom',
        path: ['usageRevisions'],
        message: '计量修订必须从 1 开始连续递增且不得重复',
      });
    const latestRevision = value.usageRevisions.at(-1)?.revision ?? 0;
    if (value.settledRevision > latestRevision)
      context.addIssue({
        code: 'custom',
        path: ['settledRevision'],
        message: '结算修订不得超过已记录的计量修订',
      });
    if (value.state === 'prepared' && value.dispatchExecutionAttempt !== null)
      context.addIssue({
        code: 'custom',
        path: ['dispatchExecutionAttempt'],
        message: 'prepared 尚未获得发送授权',
      });
    if (value.state !== 'prepared' && value.dispatchExecutionAttempt === null)
      context.addIssue({
        code: 'custom',
        path: ['dispatchExecutionAttempt'],
        message: '已发送或未知请求必须保留授权领取代次',
      });
    if (value.state === 'dispatching' && value.dispatchingAt === null)
      context.addIssue({
        code: 'custom',
        path: ['dispatchingAt'],
        message: 'dispatching 必须保留发送授权时间',
      });
    if (value.state === 'completed' && (value.completedAt === null || value.outcome === null))
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: 'completed 必须保留完成时间和结果事实',
      });
  });
export type AiRequestAttempt = z.infer<typeof aiRequestAttemptSchema>;

const researchPaidRouteSchema = z
  .object({
    provider: z.string().trim().min(1).max(120),
    models: z.array(z.string().trim().min(1).max(200)).min(1).max(32),
  })
  .strict();

const decimalIsZero = (value: string) => /^0+(?:\.0+)?$/u.test(value);

export const aiResearchPolicyV1Schema = z
  .object({
    version: z.literal('research-policy-v1').default('research-policy-v1'),
    maxAiCalls: z.number().int().min(1).max(2).default(2),
    maxInputTokens: z.number().int().min(1).max(10_000_000).default(100_000),
    maxOutputTokens: z.number().int().min(1).max(2_000_000).default(20_000),
    maxDurationSeconds: z.number().int().min(30).max(86_400).default(300),
    maxCost: nonNegativeDecimalStringSchema.default('0'),
    costCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/u)
      .nullable()
      .default(null),
    paidRoutes: z.array(researchPaidRouteSchema).max(12).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const paid = !decimalIsZero(value.maxCost);
    if (paid && (!value.costCurrency || value.paidRoutes.length === 0))
      context.addIssue({
        code: 'custom',
        path: ['maxCost'],
        message: '付费研究必须同时配置币种和允许的 Provider/模型范围',
      });
    if (!paid && (value.costCurrency !== null || value.paidRoutes.length > 0))
      context.addIssue({
        code: 'custom',
        path: ['maxCost'],
        message: '零费用策略不得携带付费路由授权',
      });
  });
export type AiResearchPolicyV1 = z.infer<typeof aiResearchPolicyV1Schema>;

export const DEFAULT_AI_RESEARCH_POLICY_V1: AiResearchPolicyV1 = aiResearchPolicyV1Schema.parse({});

export const aiAdapterContractEvidenceSchema = z
  .object({
    adapter: aiAdapterSchema,
    adapterVersion: z.string().trim().min(1).max(120),
    sdkVersion: z.string().trim().min(1).max(120),
    contract: aiGenerationContractRefSchema,
    mode: aiGenerationModeSchema,
    releaseFingerprint: z.string().trim().min(1).max(200),
  })
  .strict();

export const aiReadinessReasonSchema = z.enum([
  'configuration_invalid',
  'provider_disabled',
  'provider_down',
  'adapter_contract_evidence_missing',
  'budget_not_authorized',
  'capability_revoked',
]);
export type AiReadinessReason = z.infer<typeof aiReadinessReasonSchema>;

export const aiReadinessSchema = z
  .object({
    state: z.enum(['ready', 'blocked']),
    reasons: z.array(aiReadinessReasonSchema),
    configurationFingerprint: z.string().trim().min(1).max(200),
    evaluatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.state === 'ready' && value.reasons.length > 0)
      context.addIssue({ code: 'custom', path: ['reasons'], message: 'ready 不得携带阻断原因' });
    if (value.state === 'blocked' && value.reasons.length === 0)
      context.addIssue({ code: 'custom', path: ['reasons'], message: 'blocked 必须说明原因' });
  });

export const aiLiveValidationSchema = z
  .object({
    status: z.enum(['not_run', 'passed', 'failed']),
    checkedAt: z.iso.datetime({ offset: true }).nullable(),
    requestId: z.uuid().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'not_run' && (value.checkedAt !== null || value.requestId !== null))
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: '未执行真实验收时不得携带请求证据',
      });
    if (value.status !== 'not_run' && (!value.checkedAt || !value.requestId))
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: '真实验收结果必须包含时间和请求标识',
      });
  });

export const aiProviderModelExecutionSchema = z
  .object({
    model: z.string().trim().min(1).max(200),
    adapter: aiAdapterSchema,
    compatibilityExtensionProfile: z.literal('openrouter-v1').optional(),
    mode: aiGenerationModeSchema,
    contract: aiGenerationContractRefSchema,
    adapterEvidence: aiAdapterContractEvidenceSchema.nullable(),
    readiness: aiReadinessSchema,
    liveValidation: aiLiveValidationSchema,
    firstOutputTimeoutMs: z.number().int().positive().max(120_000).optional(),
    outputIdleTimeoutMs: z.number().int().positive().max(120_000).optional(),
    firstOutputTimeoutSource: z.enum(['route', 'provider', 'system']).optional(),
    outputIdleTimeoutSource: z.enum(['route', 'provider', 'system']).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.adapterEvidence &&
      (value.adapterEvidence.adapter !== value.adapter ||
        value.adapterEvidence.mode !== value.mode ||
        value.adapterEvidence.contract.id !== value.contract.id ||
        value.adapterEvidence.contract.version !== value.contract.version)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['adapterEvidence'],
        message: '本地契约证据必须匹配 adapter、模式和生成契约',
      });
    }
    if (value.readiness.state === 'ready' && !value.adapterEvidence) {
      context.addIssue({
        code: 'custom',
        path: ['readiness'],
        message: '接入就绪必须具备本地 adapter 契约证据',
      });
    }
  });
export type AiProviderModelExecution = z.infer<typeof aiProviderModelExecutionSchema>;

export const aiResearchRetryPrefillSchema = z
  .object({
    sourceRunId: z.uuid(),
    question: z.string().trim().min(1).max(2_000),
    context: aiResearchContextSchema,
    templateId: aiResearchTemplateIdSchema.nullable(),
    sourceOutcome: z.enum(['failed', 'unknown']),
    contextState: z.enum(['valid', 'missing', 'forbidden']),
    requiresUnknownOutcomeAcknowledgement: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.requiresUnknownOutcomeAcknowledgement !== (value.sourceOutcome === 'unknown')) {
      context.addIssue({
        code: 'custom',
        path: ['requiresUnknownOutcomeAcknowledgement'],
        message: '只有 unknown 来源要求重复生成风险确认',
      });
    }
  });
export type AiResearchRetryPrefill = z.infer<typeof aiResearchRetryPrefillSchema>;

export const aiExecutionSummarySchema = z
  .object({
    version: z.literal('sdk-execution-v1'),
    contract: aiGenerationContractRefSchema,
    frozenPolicy: aiResearchPolicyV1Schema.nullable(),
    deadlineAt: z.iso.datetime({ offset: true }).nullable(),
    generationStatus: z.enum(['pending', 'complete', 'incomplete', 'unknown']),
    usageCompleteness: aiUsageCompletenessSchema,
    requests: z.array(aiRequestAttemptSchema).max(30),
    continuationBlockedReason: z
      .enum(['budget_exceeded', 'cost_unknown', 'cancelled', 'expired', 'capability_revoked'])
      .nullable(),
  })
  .strict();
export type AiExecutionSummary = z.infer<typeof aiExecutionSummarySchema>;

const aiRequestReservationReadModelSchema = aiRequestReservationSchema.omit({
  configurationFingerprint: true,
});

export const aiExecutionRequestReadModelSchema = z
  .object({
    requestId: z.uuid(),
    sequence: z.number().int().positive(),
    state: z.enum(['prepared', 'dispatching', 'completed', 'unknown']),
    reservation: aiRequestReservationReadModelSchema,
    preparedAt: z.iso.datetime({ offset: true }),
    dispatchingAt: z.iso.datetime({ offset: true }).nullable(),
    completedAt: z.iso.datetime({ offset: true }).nullable(),
    outcome: aiGenerationOutcomeSchema.nullable(),
    error: z
      .object({
        code: aiGenerationErrorCodeSchema,
        phase: aiGenerationPhaseSchema,
        externalResult: aiExternalResultCertaintySchema,
        requestId: z.uuid().nullable(),
        retryAfterMs: z.number().int().nonnegative().max(86_400_000).optional(),
      })
      .strict()
      .nullable(),
    usage: aiUsageFactsSchema.nullable(),
    cost: aiCostFactsSchema.nullable(),
  })
  .strict();
export type AiExecutionRequestReadModel = z.infer<typeof aiExecutionRequestReadModelSchema>;

export const aiExecutionReadModelSchema = z
  .object({
    version: z.literal('sdk-execution-v1'),
    contract: aiGenerationContractRefSchema,
    frozenPolicy: aiResearchPolicyV1Schema.nullable(),
    deadlineAt: z.iso.datetime({ offset: true }).nullable(),
    generationStatus: z.enum(['pending', 'complete', 'incomplete', 'unknown']),
    usageCompleteness: aiUsageCompletenessSchema,
    requests: z.array(aiExecutionRequestReadModelSchema).max(30),
    continuationBlockedReason: z
      .enum(['budget_exceeded', 'cost_unknown', 'cancelled', 'expired', 'capability_revoked'])
      .nullable(),
  })
  .strict();
export type AiExecutionReadModel = z.infer<typeof aiExecutionReadModelSchema>;

export const aiUsageSummaryReadModelSchema = z
  .object({
    runs: z.number().int().nonnegative(),
    reportedInputTokens: z.number().int().nonnegative(),
    reportedOutputTokens: z.number().int().nonnegative(),
    partialRuns: z.number().int().nonnegative(),
    unknownRuns: z.number().int().nonnegative(),
    legacyUnknownRuns: z.number().int().nonnegative(),
    unknownCostRuns: z.number().int().nonnegative(),
    unconfirmedInputTokenReservation: z.number().int().nonnegative(),
    unconfirmedOutputTokenReservation: z.number().int().nonnegative(),
    costs: z.array(
      z
        .object({
          currency: z.string().regex(/^[A-Z]{3}$/u),
          knownAmount: nonNegativeDecimalStringSchema,
          estimatedAmount: nonNegativeDecimalStringSchema,
          unconfirmedReservedAmount: nonNegativeDecimalStringSchema,
        })
        .strict(),
    ),
  })
  .strict();
export type AiUsageSummaryReadModel = z.infer<typeof aiUsageSummaryReadModelSchema>;
