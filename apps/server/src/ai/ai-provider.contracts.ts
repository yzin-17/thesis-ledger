import { z } from 'zod';
import type { ProviderState } from '../providers/provider-health.service.js';

export const httpUrl = z.url().refine((value) => {
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

export const aiProviderInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    baseUrl: httpUrl,
    models: z.array(z.string().trim().min(1).max(200)).min(1).max(32),
    modelReasoning: modelReasoningSchema,
    apiKey: z.string().trim().min(1).max(10_000).optional(),
    credentialsRef: z.string().trim().min(1).max(10_000).optional(),
    enabled: z.boolean().optional(),
    priority: z.number().int().nonnegative().optional().default(100),
    capabilities: z.array(z.string().trim().min(1).max(80)).min(1).max(32).optional(),
    timeoutMs: z.number().int().positive().max(120_000).optional(),
    costPer1kInput: z.number().nonnegative().optional(),
    costPer1kOutput: z.number().nonnegative().optional(),
    costCurrency: z.string().trim().min(1).max(16).optional(),
    pricingVersion: z.string().trim().min(1).max(120).optional(),
    connectionTestToken: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const models = value.models.map((model) => model.trim());
    if (new Set(models).size !== models.length)
      context.addIssue({ code: 'custom', path: ['models'], message: '模型不得重复' });
    if (value.apiKey && value.credentialsRef)
      context.addIssue({ code: 'custom', path: ['apiKey'], message: 'API Key 只能填写一个字段' });
    const reasoningModels = Object.keys(value.modelReasoning ?? {});
    const selectedModels = new Set(models);
    if (reasoningModels.some((model) => !selectedModels.has(model)))
      context.addIssue({
        code: 'custom',
        path: ['modelReasoning'],
        message: '模型推理能力只能保存已选择的模型',
      });
  });

export type AiProviderInput = z.infer<typeof aiProviderInputSchema>;
export type AiProviderSource = 'database' | 'environment';

export const aiProviderModelCatalogInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    baseUrl: httpUrl,
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
  modelReasoning?: Record<string, AiProviderModelReasoning>;
  timeoutMs?: number;
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
  'healthy' | 'degraded' | 'down' | 'disabled' | 'unconfigured' | 'config_error';

export interface AiProviderTestResult {
  name: string;
  status: AiProviderTestStatus;
  message: string;
  credentialConfigured: boolean;
  model?: string;
  latencyMs?: number;
  errorCode?: string;
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
