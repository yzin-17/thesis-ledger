import { z } from 'zod';
import { omitUndefinedDeep } from './exact-optional.js';
import {
  aiAuthModeSchema,
  aiProviderTestKindSchema,
  aiGenerationModeSchema,
  aiCostFactsSchema,
  aiUsageFactsSchema,
  aiProviderModelExecutionSchema,
} from './ai-execution.js';
import { aiChatImplementationSchema, aiUpstreamFormatSchema } from './ai-provider.js';
import {
  aiProviderExecutionRouteInputSchema,
  aiProviderModelDefaultConfigSchema,
  aiProviderModelPricingInputSchema,
  aiProviderModelReasoningSchema,
  aiProviderTestPurposeSchema,
} from './ai-provider-management-input.js';

const modelMap = <T extends z.ZodType>(schema: T) => z.record(z.string(), schema).optional();
const price = aiProviderModelPricingInputSchema
  .extend({
    pricingVersion: z.string().optional(),
    updatedAt: z.string().optional(),
    source: z.enum(['user', 'legacy_provider']).optional(),
  })
  .strip();
// 白名单投影：凭证只能写入，不能进入查询缓存或编辑回显。
export const aiProviderRecordSchema = z
  .object({
    name: z.string().min(1),
    type: z.literal('ai'),
    enabled: z.boolean(),
    priority: z.number(),
    capabilities: z.array(z.string()),
    health: z.string(),
    source: z.literal('database').optional(),
    credentialConfigured: z.boolean().optional(),
    baseUrl: z.string().nullable().optional(),
    models: z.array(z.string()).optional(),
    authMode: aiAuthModeSchema.optional(),
    upstreamFormat: aiUpstreamFormatSchema.optional(),
    chatImplementation: aiChatImplementationSchema.optional(),
    compatibilityExtensionProfile: z.literal('openrouter-v1').optional(),
    executionRouteConfigs: z.array(aiProviderExecutionRouteInputSchema).optional(),
    modelDefaults: modelMap(aiProviderModelDefaultConfigSchema),
    executionRoutes: z.array(aiProviderModelExecutionSchema).optional(),
    modelPricing: modelMap(price),
    modelReasoning: modelMap(aiProviderModelReasoningSchema),
    timeoutMs: z.number().optional(),
    firstOutputTimeoutMs: z.number().optional(),
    outputIdleTimeoutMs: z.number().optional(),
    costPer1kInput: z.number().optional(),
    costPer1kOutput: z.number().optional(),
    costCurrency: z.string().optional(),
    pricingVersion: z.string().optional(),
    updatedAt: z.string().nullable().optional(),
    checkedAt: z.string().nullable().optional(),
    latencyMs: z.number().nullable().optional(),
    errorCode: z.string().nullable().optional(),
    configError: z.string().optional(),
  })
  .transform(omitUndefinedDeep);
export type AiProviderRecord = z.infer<typeof aiProviderRecordSchema>;
export const aiProviderRecordsSchema = z.array(aiProviderRecordSchema);
export const aiProviderTestResultSchema = z
  .object({
    name: z.string(),
    status: z.enum([
      'healthy',
      'degraded',
      'down',
      'disabled',
      'unconfigured',
      'config_error',
      'cancelled',
    ]),
    message: z.string(),
    credentialConfigured: z.boolean(),
    authMode: aiAuthModeSchema.optional(),
    testKind: aiProviderTestKindSchema.optional(),
    purpose: aiProviderTestPurposeSchema.optional(),
    mode: aiGenerationModeSchema.optional(),
    model: z.string().optional(),
    latencyMs: z.number().optional(),
    usage: aiUsageFactsSchema.optional(),
    cost: aiCostFactsSchema.optional(),
    errorCode: z.string().optional(),
    requestId: z.string().optional(),
    testToken: z.string().optional(),
    healthCheck: z
      .object({
        state: z.string(),
        latencyMs: z.number().nullable(),
        checkedAt: z.string(),
        source: z.literal('manual'),
      })
      .optional(),
  })
  .transform(omitUndefinedDeep);
export const aiProviderModelCatalogResultSchema = z
  .object({
    models: z.array(z.string()),
    modelDetails: z.array(
      z.object({ id: z.string(), reasoning: aiProviderModelReasoningSchema.optional() }),
    ),
    fetchedAt: z.string(),
  })
  .transform(omitUndefinedDeep);
export const aiProviderTestCancelResultSchema = z.object({
  name: z.string(),
  requestId: z.string(),
  cancelled: z.boolean(),
});
export const aiProviderValidationCancelResultSchema = z.object({
  cancelled: z.boolean(),
});
export const aiRoutingSettingsViewSchema = z.object({
  researchDefault: z.object({ providerId: z.string().min(1), model: z.string().min(1) }).nullable(),
  revision: z.string().min(1),
  candidates: z.array(
    z.object({
      providerId: z.string(),
      providerName: z.string(),
      model: z.string(),
      enabled: z.boolean(),
      health: z.string(),
      authMode: aiAuthModeSchema,
      priceConfigured: z.boolean(),
    }),
  ),
});
export const aiRoutingSettingsUpdateSchema = aiRoutingSettingsViewSchema
  .pick({ researchDefault: true })
  .extend({ expectedRevision: z.string().min(1).max(120) })
  .strict();
export type AiRoutingSettingsView = z.infer<typeof aiRoutingSettingsViewSchema>;
export type AiRoutingSettingsUpdate = z.input<typeof aiRoutingSettingsUpdateSchema>;
