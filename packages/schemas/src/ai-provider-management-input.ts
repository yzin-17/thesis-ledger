import { z } from 'zod';
import { aiOutputPolicySchema } from './ai-provider-validation.js';
import {
  aiChatImplementationSchema,
  aiCompatibilityExtensionProfileSchema,
  aiUpstreamFormatSchema,
  aiUpstreamSelectionSchema,
} from './ai-provider.js';
import {
  aiAuthModeSchema,
  aiProviderTestKindSchema,
  aiGenerationContractRefSchema,
  aiGenerationModeSchema,
} from './ai-execution.js';

const httpUrl = z.url().refine((value) => {
  try {
    return /^https?:$/u.test(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'Base URL 必须使用 HTTP(S)');

export const reasoningEffortSchema = z.enum([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>;

export const aiProviderModelReasoningSchema = z
  .object({
    supportedEfforts: z.array(reasoningEffortSchema).nullable().optional(),
    defaultEffort: reasoningEffortSchema.optional(),
    defaultEnabled: z.boolean().optional(),
    supportsMaxTokens: z.boolean().optional(),
    mandatory: z.boolean().optional(),
  })
  .strict();

export type AiProviderModelReasoning = z.infer<typeof aiProviderModelReasoningSchema>;

const modelReasoningSchema = z
  .record(z.string().trim().min(1).max(200), aiProviderModelReasoningSchema)
  .refine((value) => Object.keys(value).length <= 32, '最多保存 32 个模型推理能力')
  .optional();

export const aiProviderModelPricingInputSchema = z
  .object({
    costPer1kInput: z.number().finite().nonnegative().optional(),
    costPer1kOutput: z.number().finite().nonnegative().optional(),
    costCurrency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/u, '费用币种必须是 3 位大写字母')
      .optional(),
  })
  .strict();

export type AiProviderModelPricingInput = z.infer<typeof aiProviderModelPricingInputSchema>;

export const aiProviderModelDefaultConfigSchema = z
  .object({ mode: aiGenerationModeSchema, outputPolicy: aiOutputPolicySchema.optional() })
  .strict();
export type AiProviderModelDefaultConfig = z.infer<typeof aiProviderModelDefaultConfigSchema>;

const modelDefaultsSchema = z
  .record(z.string().trim().min(1).max(200), aiProviderModelDefaultConfigSchema)
  .refine((value) => Object.keys(value).length <= 32, '最多保存 32 个模型默认配置')
  .optional();

export const aiProviderModelPricingViewSchema = aiProviderModelPricingInputSchema
  .extend({
    pricingVersion: z.string().trim().min(1).max(120),
    updatedAt: z.iso.datetime({ offset: true }),
    source: z.enum(['user', 'legacy_provider']),
  })
  .strict();

export type AiProviderModelPricingView = z.infer<typeof aiProviderModelPricingViewSchema>;

const modelPricingSchema = z
  .record(z.string().trim().min(1).max(200), aiProviderModelPricingInputSchema)
  .refine((value) => Object.keys(value).length <= 32, '最多保存 32 个模型价格');

const stripLegacyRouteFields = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const route = { ...(value as Record<string, unknown>) };
  delete route.capabilityDeclaration;
  delete route.freeEvidence;
  delete route.allowedUpstreams;
  return route;
};

export const aiProviderExecutionRouteInputSchema = z.preprocess(
  stripLegacyRouteFields,
  z
    .object({
      model: z.string().trim().min(1).max(200),
      mode: aiGenerationModeSchema,
      outputPolicy: aiOutputPolicySchema.optional(),
      // Undefined is the persisted representation for legacy enabled routes.
      enabled: z.boolean().optional(),
      modeOverridden: z.boolean().optional(),
      contract: aiGenerationContractRefSchema,
      firstOutputTimeoutMs: z.number().int().positive().max(120_000).optional(),
      outputIdleTimeoutMs: z.number().int().positive().max(120_000).optional(),
      reasoningEnabled: z.boolean().optional(),
    })
    .strict()
    .refine(
      (route) =>
        route.reasoningEnabled === undefined ||
        (route.contract.id === 'research' && route.contract.version === 'research-generation-v2'),
      { path: ['reasoningEnabled'], message: '显式推理开关仅适用于研究 V2' },
    ),
);

export type AiProviderExecutionRouteInput = z.infer<typeof aiProviderExecutionRouteInputSchema>;

export const aiProviderInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    baseUrl: httpUrl,
    models: z.array(z.string().trim().min(1).max(200)).min(1).max(32),
    authMode: aiAuthModeSchema.default('api_key'),
    upstreamFormat: aiUpstreamFormatSchema.default('chat-completions'),
    chatImplementation: aiChatImplementationSchema.optional(),
    compatibilityExtensionProfile: aiCompatibilityExtensionProfileSchema.optional(),
    executionRoutes: z.array(aiProviderExecutionRouteInputSchema).max(96).optional(),
    modelDefaults: modelDefaultsSchema,
    modelPricing: modelPricingSchema.optional(),
    modelReasoning: modelReasoningSchema,
    apiKey: z.string().trim().min(1).max(10_000).optional(),
    credentialsRef: z.string().trim().min(1).max(10_000).optional(),
    enabled: z.boolean().optional(),
    priority: z.number().int().nonnegative().optional().default(100),
    capabilities: z.array(z.string().trim().min(1).max(80)).min(1).max(32).optional(),
    timeoutMs: z.number().int().positive().max(120_000).optional(),
    firstOutputTimeoutMs: z.number().int().positive().max(120_000).optional(),
    outputIdleTimeoutMs: z.number().int().positive().max(120_000).optional(),
    costPer1kInput: z.number().nonnegative().optional(),
    costPer1kOutput: z.number().nonnegative().optional(),
    costCurrency: z.string().trim().min(1).max(16).optional(),
    expectedRevision: z.iso.datetime({ offset: true }).optional(),
    connectionTestToken: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.compatibilityExtensionProfile &&
      (value.upstreamFormat !== 'chat-completions' ||
        (value.chatImplementation ?? 'compatible') !== 'compatible')
    )
      context.addIssue({
        code: 'custom',
        path: ['compatibilityExtensionProfile'],
        message: 'OpenRouter 兼容扩展仅适用于兼容 Chat Completions 实现',
      });
    const selection = aiUpstreamSelectionSchema.safeParse({
      upstreamFormat: value.upstreamFormat,
      ...(value.chatImplementation === undefined
        ? {}
        : { chatImplementation: value.chatImplementation }),
    });
    if (!selection.success)
      for (const issue of selection.error.issues)
        context.addIssue({
          code: 'custom',
          path: issue.path,
          message: issue.message,
        });
    const models = value.models.map((model) => model.trim());
    if (new Set(models).size !== models.length)
      context.addIssue({ code: 'custom', path: ['models'], message: '模型不得重复' });
    if (value.apiKey && value.credentialsRef)
      context.addIssue({ code: 'custom', path: ['apiKey'], message: 'API Key 只能填写一个字段' });
    if (value.authMode === 'none' && (value.apiKey || value.credentialsRef))
      context.addIssue({
        code: 'custom',
        path: ['authMode'],
        message: '无需认证模式不能提交 API Key',
      });
    const reasoningModels = Object.keys(value.modelReasoning ?? {});
    const selectedModels = new Set(models);
    if (reasoningModels.some((model) => !selectedModels.has(model)))
      context.addIssue({
        code: 'custom',
        path: ['modelReasoning'],
        message: '模型推理能力只能保存已选择的模型',
      });
    const pricingModels = Object.keys(value.modelPricing ?? {});
    if (pricingModels.some((model) => !selectedModels.has(model)))
      context.addIssue({
        code: 'custom',
        path: ['modelPricing'],
        message: '模型价格只能保存已选择的模型',
      });
    const defaultModels = Object.keys(value.modelDefaults ?? {});
    if (defaultModels.some((model) => !selectedModels.has(model)))
      context.addIssue({
        code: 'custom',
        path: ['modelDefaults'],
        message: '模型默认配置只能保存已选择的模型',
      });
    const executionRoutes = value.executionRoutes ?? [];
    if (executionRoutes.some((route) => !selectedModels.has(route.model)))
      context.addIssue({
        code: 'custom',
        path: ['executionRoutes'],
        message: '执行路由只能配置已选择的模型',
      });
    const routeKeys = executionRoutes.map((route) => `${route.model}\u0000${route.contract.id}`);
    if (new Set(routeKeys).size !== routeKeys.length)
      context.addIssue({
        code: 'custom',
        path: ['executionRoutes'],
        message: '同一模型、同一业务用途只能配置一条执行路由',
      });
  });

export type AiProviderInput = z.infer<typeof aiProviderInputSchema>;
export type AiProviderSaveInput = z.input<typeof aiProviderInputSchema>;

export const aiProviderLifecycleOptionsSchema = z
  .object({
    expectedRevision: z.iso.datetime({ offset: true }).optional(),
    clearResearchDefault: z.boolean().optional().default(false),
    expectedSettingsRevision: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type AiProviderLifecycleOptions = z.input<typeof aiProviderLifecycleOptionsSchema>;

export const aiProviderTestPurposeSchema = z.enum([
  'strategy_authoring_analysis',
  'strategy_authoring_generation',
  'strategy_authoring_modification',
  'research',
  'parameter_optimization',
  'strategy_discovery',
]);
export type AiProviderTestPurpose = z.infer<typeof aiProviderTestPurposeSchema>;

export const aiProviderTestOptionsSchema = z
  .object({
    model: z.string().trim().min(1).max(200).optional(),
    testKind: aiProviderTestKindSchema.default('connection'),
    purpose: aiProviderTestPurposeSchema.optional(),
    mode: aiGenerationModeSchema.optional(),
    budgetAuthorized: z.boolean().optional(),
    requestId: z.uuid().optional(),
  })
  .strict();

export const aiProviderTestInputSchema = z.intersection(
  aiProviderInputSchema,
  aiProviderTestOptionsSchema,
);
export type AiProviderTestInput = z.infer<typeof aiProviderTestInputSchema>;
export type AiProviderDraftTestInput = z.input<typeof aiProviderTestInputSchema>;
export type AiProviderSavedTestOptions = z.input<typeof aiProviderTestOptionsSchema>;

export const aiProviderTestCancelInputSchema = z.object({ requestId: z.uuid() }).strict();

export type AiProviderSource = 'database';

export const aiProviderModelCatalogInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    baseUrl: httpUrl,
    authMode: aiAuthModeSchema.default('api_key'),
    upstreamFormat: aiUpstreamFormatSchema.optional(),
    apiKey: z.string().trim().min(1).max(10_000).optional(),
    credentialsRef: z.string().trim().min(1).max(10_000).optional(),
    timeoutMs: z.number().int().positive().max(120_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.apiKey && value.credentialsRef)
      context.addIssue({ code: 'custom', path: ['apiKey'], message: 'API Key 只能填写一个字段' });
  });

export type AiProviderModelCatalogInput = z.infer<typeof aiProviderModelCatalogInputSchema>;
export type AiProviderModelCatalogRequest = z.input<typeof aiProviderModelCatalogInputSchema>;
