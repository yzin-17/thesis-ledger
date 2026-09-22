import { z } from 'zod';
import {
  aiOutputPolicySchema,
  aiChatImplementationSchema,
  aiAuthModeSchema,
  aiProviderTestKindSchema,
  aiGenerationContractRefSchema,
  aiGenerationModeSchema,
  aiUpstreamFormatSchema,
  aiUpstreamSelectionSchema,
  type AiCostFacts,
  type AiUsageFacts,
  type AiProviderModelExecution,
} from '@thesis-ledger/schemas';
import type { AiAuthMode, AiProviderTestKind } from '@thesis-ledger/schemas';
import type { ProviderState } from '../providers/provider-health.service.js';

export const httpUrl = z.url().refine((value) => {
  try {
    return /^https?:$/u.test(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'Base URL 必须使用 HTTP(S)');

export { aiAuthModeSchema };
export type { AiAuthMode };

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

export const parseAiProviderModelPricing = (
  value: unknown,
  models: readonly string[],
): Record<string, AiProviderModelPricingView> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const selectedModels = new Set(models);
  const entries = Object.entries(value)
    .filter(([model]) => selectedModels.has(model))
    .slice(0, 32)
    .flatMap(([model, pricing]) => {
      const parsed = aiProviderModelPricingViewSchema.safeParse(pricing);
      return parsed.success ? [[model, parsed.data] as const] : [];
    });
  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

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
    })
    .strict(),
);

export type AiProviderExecutionRouteInput = z.infer<typeof aiProviderExecutionRouteInputSchema>;

export const aiProviderCapabilityRevocationSchema = z
  .object({
    model: z.string().trim().min(1).max(200),
    mode: aiGenerationModeSchema,
    contract: aiGenerationContractRefSchema,
    configurationFingerprint: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(240),
    revokedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type AiProviderCapabilityRevocation = z.infer<typeof aiProviderCapabilityRevocationSchema>;

export const aiProviderInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    baseUrl: httpUrl,
    models: z.array(z.string().trim().min(1).max(200)).min(1).max(32),
    authMode: aiAuthModeSchema.default('api_key'),
    upstreamFormat: aiUpstreamFormatSchema.default('chat-completions'),
    chatImplementation: aiChatImplementationSchema.optional(),
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

export const aiProviderLifecycleOptionsSchema = z
  .object({
    expectedRevision: z.iso.datetime({ offset: true }).optional(),
    clearResearchDefault: z.boolean().optional().default(false),
    expectedSettingsRevision: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type AiProviderLifecycleOptions = z.input<typeof aiProviderLifecycleOptionsSchema>;

export { aiProviderTestKindSchema };
export type { AiProviderTestKind } from '@thesis-ledger/schemas';

export const aiProviderTestPurposeSchema = z.enum([
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

export const aiProviderTestCancelInputSchema = z.object({ requestId: z.uuid() }).strict();

export type AiProviderSource = 'database' | 'environment';

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

export interface AiProviderModelCatalogResult {
  models: string[];
  modelDetails: AiProviderModelCatalogItem[];
  fetchedAt: string;
}

export interface AiProviderModelCatalogItem {
  id: string;
  reasoning?: AiProviderModelReasoning;
}

export interface AiProviderSummary {
  name: string;
  type: 'ai';
  source: AiProviderSource;
  enabled: boolean;
  priority: number;
  capabilities: string[];
  baseUrl: string | null;
  models: string[];
  upstreamFormat?: z.infer<typeof aiUpstreamFormatSchema>;
  authMode: AiAuthMode;
  chatImplementation?: z.infer<typeof aiChatImplementationSchema>;
  executionRouteConfigs?: AiProviderExecutionRouteInput[];
  modelDefaults?: Record<string, AiProviderModelDefaultConfig>;
  executionRoutes?: AiProviderModelExecution[];
  modelPricing?: Record<string, AiProviderModelPricingView> | undefined;
  modelReasoning?: Record<string, AiProviderModelReasoning>;
  timeoutMs?: number;
  firstOutputTimeoutMs?: number;
  outputIdleTimeoutMs?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  costCurrency?: string;
  pricingVersion?: string;
  credentialConfigured: boolean;
  health: string;
  updatedAt: string | null;
  checkedAt: string | null;
  latencyMs: number | null;
  errorCode: string | null;
  configError?: string;
}

export type AiProviderTestStatus =
  'healthy' | 'degraded' | 'down' | 'disabled' | 'unconfigured' | 'config_error' | 'cancelled';

export interface AiProviderTestResult {
  name: string;
  status: AiProviderTestStatus;
  message: string;
  credentialConfigured: boolean;
  authMode?: AiAuthMode;
  testKind?: AiProviderTestKind;
  purpose?: AiProviderTestPurpose;
  mode?: z.infer<typeof aiGenerationModeSchema>;
  model?: string;
  latencyMs?: number;
  usage?: AiUsageFacts;
  cost?: AiCostFacts;
  errorCode?: string;
  requestId?: string;
  testToken?: string;
  healthCheck?: {
    state: ProviderState;
    latencyMs: number | null;
    checkedAt: string;
    source: 'manual';
  };
}

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const stringArray = (value: unknown) => {
  if (!Array.isArray(value)) return null;
  const values = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim());
  return values.length === value.length &&
    values.length > 0 &&
    values.every(Boolean) &&
    new Set(values).size === values.length
    ? values
    : null;
};

export const healthValue = (value: unknown) =>
  value === 'healthy' || value === 'degraded' || value === 'down' ? value : 'unknown';

export const sanitizeAiProviderError = (error: unknown, credential?: string) => {
  const message = error instanceof Error ? error.message : 'Provider 连接失败';
  return message
    .replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|token|secret))[=:]\s*\S+/giu, '$1=[REDACTED]')
    .replace(/sk-[a-z0-9_-]+/giu, '[REDACTED]')
    .replace(
      credential ? new RegExp(credential.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'g') : /$^/u,
      '[REDACTED]',
    )
    .slice(0, 240);
};

export const errorCodeFor = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if (/timeout|aborted|abort/iu.test(message)) return 'provider_timeout';
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden/iu.test(message)) return 'provider_auth';
  if (/\b429\b|rate.?limit/iu.test(message)) return 'provider_rate_limited';
  return 'provider_error';
};
