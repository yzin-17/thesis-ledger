import type { ProviderConfig } from '@prisma/client';
import { invalidStoredModelRequestOptions } from './ai-model-request-options.js';
import {
  aiLegacyAdapterSchema,
  aiProviderModelCatalogConfigSchema,
  aiProviderModelCatalogOriginAllowed,
  aiUpstreamSelectionSchema,
  type AiAdapter,
  type AiChatImplementation,
  type AiUpstreamFormat,
  type AiProviderModelCatalogConfig,
} from '@thesis-ledger/schemas';
import {
  AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1,
  runtimeAdapterForSelection,
  selectionFromLegacyAdapter,
  type AiCompatibilityExtensionProfile,
} from './ai-provider-upstream.js';
import {
  asRecord,
  healthValue,
  httpUrl,
  stringArray,
  aiProviderModelReasoningSchema,
  aiProviderCapabilityRevocationSchema,
  aiProviderExecutionRouteInputSchema,
  aiProviderModelDefaultConfigSchema,
  aiAuthModeSchema,
  parseAiProviderModelPricing,
  type AiProviderCapabilityRevocation,
  type AiProviderExecutionRouteInput,
  type AiProviderModelDefaultConfig,
  type AiProviderModelPricingView,
  type AiProviderModelReasoning,
  type AiProviderSummary,
} from './ai-provider.contracts.js';
import type { AiAuthMode } from '@thesis-ledger/schemas';

export interface ParsedAiProviderSettings {
  baseUrl: string;
  models: string[];
  modelCatalog?: AiProviderModelCatalogConfig;
  authMode: AiAuthMode;
  upstreamFormat: AiUpstreamFormat;
  chatImplementation?: AiChatImplementation;
  compatibilityExtensionProfile?: AiCompatibilityExtensionProfile;
  adapter: AiAdapter;
  executionRoutes?: AiProviderExecutionRouteInput[];
  modelDefaults?: Record<string, AiProviderModelDefaultConfig>;
  capabilityRevocations?: AiProviderCapabilityRevocation[];
  modelPricing?: Record<string, AiProviderModelPricingView>;
  modelReasoning?: Record<string, AiProviderModelReasoning>;
  timeoutMs?: number;
  firstOutputTimeoutMs?: number;
  outputIdleTimeoutMs?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  costCurrency?: string;
  pricingVersion?: string;
}

export const parseAiProviderSettings = (value: unknown): ParsedAiProviderSettings | null => {
  const record = asRecord(value);
  if (!record) return null;
  const baseUrl = record.baseUrl;
  const models = stringArray(record.models);
  if (typeof baseUrl !== 'string' || !httpUrl.safeParse(baseUrl).success || !models) return null;
  if (invalidStoredModelRequestOptions(record.modelDefaults, models)) return null;
  const authMode = aiAuthModeSchema.safeParse(record.authMode ?? 'api_key');
  if (!authMode.success) return null;
  const modelCatalog = aiProviderModelCatalogConfigSchema.nullish().safeParse(record.modelCatalog);
  if (
    !modelCatalog.success ||
    !aiProviderModelCatalogOriginAllowed(baseUrl, modelCatalog.data, authMode.data)
  )
    return null;
  const modelReasoning = parseModelReasoning(record.modelReasoning, models);
  const modelPricing = parseAiProviderModelPricing(record.modelPricing, models);
  const legacyAdapter = aiLegacyAdapterSchema.safeParse(record.adapter);
  const executionRoutes = parseExecutionRoutes(record.executionRoutes, models);
  const modelDefaults = parseModelDefaults(record.modelDefaults, models);
  const capabilityRevocations = parseCapabilityRevocations(record.capabilityRevocations);
  const explicitSelection = aiUpstreamSelectionSchema.safeParse({
    upstreamFormat: record.upstreamFormat,
    ...(record.chatImplementation === undefined
      ? {}
      : { chatImplementation: record.chatImplementation }),
  });
  if (
    !explicitSelection.success &&
    (record.upstreamFormat !== undefined || record.chatImplementation !== undefined)
  )
    return null;
  if (!explicitSelection.success && !legacyAdapter.success) return null;
  const selection = explicitSelection.success
    ? explicitSelection.data
    : selectionFromLegacyAdapter(legacyAdapter.data!);
  const storedProfile =
    record.compatibilityExtensionProfile === AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1
      ? AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1
      : undefined;
  const migratedProfile =
    !explicitSelection.success &&
    legacyAdapter.success &&
    legacyAdapter.data === 'openrouter' &&
    Boolean(executionRoutes?.length)
      ? AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1
      : undefined;
  const compatibilityExtensionProfile = storedProfile ?? migratedProfile;
  const adapter = runtimeAdapterForSelection(selection, compatibilityExtensionProfile);
  return {
    baseUrl,
    models,
    ...(modelCatalog.data ? { modelCatalog: modelCatalog.data } : {}),
    authMode: authMode.data,
    upstreamFormat: selection.upstreamFormat,
    ...(selection.upstreamFormat === 'chat-completions'
      ? { chatImplementation: selection.chatImplementation }
      : {}),
    ...(compatibilityExtensionProfile ? { compatibilityExtensionProfile } : {}),
    adapter,
    ...(executionRoutes ? { executionRoutes } : {}),
    ...(modelDefaults ? { modelDefaults } : {}),
    ...(capabilityRevocations ? { capabilityRevocations } : {}),
    ...(modelPricing ? { modelPricing } : {}),
    ...(modelReasoning ? { modelReasoning } : {}),
    ...(typeof record.timeoutMs === 'number' ? { timeoutMs: record.timeoutMs } : {}),
    ...(typeof record.firstOutputTimeoutMs === 'number'
      ? { firstOutputTimeoutMs: record.firstOutputTimeoutMs }
      : {}),
    ...(typeof record.outputIdleTimeoutMs === 'number'
      ? { outputIdleTimeoutMs: record.outputIdleTimeoutMs }
      : {}),
    ...(typeof record.costPer1kInput === 'number' ? { costPer1kInput: record.costPer1kInput } : {}),
    ...(typeof record.costPer1kOutput === 'number'
      ? { costPer1kOutput: record.costPer1kOutput }
      : {}),
    ...(typeof record.costCurrency === 'string' ? { costCurrency: record.costCurrency } : {}),
    ...(typeof record.pricingVersion === 'string' ? { pricingVersion: record.pricingVersion } : {}),
  };
};

const parseExecutionRoutes = (
  value: unknown,
  models: readonly string[],
): AiProviderExecutionRouteInput[] | null => {
  if (!Array.isArray(value)) return null;
  const selected = new Set(models);
  const parsed = value
    .map((route) => aiProviderExecutionRouteInputSchema.safeParse(route))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter((route) => selected.has(route.model));
  return parsed.length > 0 ? parsed : null;
};

const parseModelDefaults = (
  value: unknown,
  models: readonly string[],
): Record<string, AiProviderModelDefaultConfig> | null => {
  const record = asRecord(value);
  if (!record) return null;
  const selected = new Set(models);
  const entries = Object.entries(record)
    .filter(([model]) => selected.has(model))
    .slice(0, 32)
    .flatMap(([model, defaults]) => {
      const parsed = aiProviderModelDefaultConfigSchema.safeParse(defaults);
      return parsed.success ? [[model, parsed.data] as const] : [];
    });
  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

const parseCapabilityRevocations = (value: unknown): AiProviderCapabilityRevocation[] | null => {
  if (!Array.isArray(value)) return null;
  const parsed = value
    .map((entry) => aiProviderCapabilityRevocationSchema.safeParse(entry))
    .filter((result) => result.success)
    .map((result) => result.data);
  return parsed.length > 0 ? parsed : null;
};

const parseModelReasoning = (
  value: unknown,
  models: readonly string[],
): Record<string, AiProviderModelReasoning> | null => {
  const record = asRecord(value);
  if (!record) return null;
  const selected = new Set(models);
  const entries = Object.entries(record)
    .filter(([model]) => selected.has(model))
    .slice(0, 32)
    .flatMap(([model, reasoning]) => {
      const parsed = aiProviderModelReasoningSchema.safeParse(reasoning);
      return parsed.success ? [[model, parsed.data] as const] : [];
    });
  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

export const aiProviderCapabilities = (value: unknown) => stringArray(value) ?? ['chat'];

export const resolveCompatibilityProfile = (
  input: {
    compatibilityExtensionProfile?: AiCompatibilityExtensionProfile | undefined;
    upstreamFormat?: AiUpstreamFormat | undefined;
    chatImplementation?: AiChatImplementation | undefined;
  },
  settings: unknown,
) => {
  if (input.compatibilityExtensionProfile !== undefined) return input.compatibilityExtensionProfile;
  const stored = parseAiProviderSettings(settings);
  const format = input.upstreamFormat ?? stored?.upstreamFormat;
  let implementation = input.chatImplementation;
  if (implementation === undefined && input.upstreamFormat === undefined)
    implementation = stored?.chatImplementation;
  if (format !== 'chat-completions' || implementation === 'openai-native') return undefined;
  return stored?.compatibilityExtensionProfile;
};

type HealthSnapshot = {
  state: string;
  checkedAt?: Date | null;
  latencyMs?: number | null;
  errorCode?: string | null;
} | null;

const settingsSummary = (settings: ParsedAiProviderSettings | null) => {
  const modelPricing = settings?.modelPricing;
  return {
    authMode: settings?.authMode ?? 'api_key',
    ...(settings?.modelCatalog ? { modelCatalog: settings.modelCatalog } : {}),
    ...(settings?.upstreamFormat === undefined ? {} : { upstreamFormat: settings.upstreamFormat }),
    ...(settings?.chatImplementation === undefined
      ? {}
      : { chatImplementation: settings.chatImplementation }),
    ...(settings?.executionRoutes === undefined
      ? {}
      : { executionRouteConfigs: settings.executionRoutes }),
    ...(settings?.modelDefaults === undefined ? {} : { modelDefaults: settings.modelDefaults }),
    ...(modelPricing ? { modelPricing } : {}),
    ...(settings?.modelReasoning === undefined ? {} : { modelReasoning: settings.modelReasoning }),
    ...(settings?.timeoutMs === undefined ? {} : { timeoutMs: settings.timeoutMs }),
    ...(settings?.firstOutputTimeoutMs === undefined
      ? {}
      : { firstOutputTimeoutMs: settings.firstOutputTimeoutMs }),
    ...(settings?.outputIdleTimeoutMs === undefined
      ? {}
      : { outputIdleTimeoutMs: settings.outputIdleTimeoutMs }),
    ...(settings?.costPer1kInput === undefined ? {} : { costPer1kInput: settings.costPer1kInput }),
    ...(settings?.costPer1kOutput === undefined
      ? {}
      : { costPer1kOutput: settings.costPer1kOutput }),
    ...(settings?.costCurrency === undefined ? {} : { costCurrency: settings.costCurrency }),
    ...(settings?.pricingVersion === undefined ? {} : { pricingVersion: settings.pricingVersion }),
  };
};

const legacyModelPricing = (settings: ParsedAiProviderSettings | null) => {
  if (!settings || settings.modelPricing) return undefined;
  const hasLegacyValue =
    settings.costPer1kInput !== undefined ||
    settings.costPer1kOutput !== undefined ||
    settings.costCurrency !== undefined;
  if (!hasLegacyValue) return undefined;
  return Object.fromEntries(
    settings.models.map((model) => [
      model,
      {
        ...(settings.costPer1kInput === undefined
          ? {}
          : { costPer1kInput: settings.costPer1kInput }),
        ...(settings.costPer1kOutput === undefined
          ? {}
          : { costPer1kOutput: settings.costPer1kOutput }),
        ...(settings.costCurrency === undefined ? {} : { costCurrency: settings.costCurrency }),
        pricingVersion: settings.pricingVersion ?? 'legacy-provider',
        updatedAt: '1970-01-01T00:00:00.000Z',
        source: 'legacy_provider' as const,
      },
    ]),
  );
};

export const aiProviderSummaryFromRow = (
  row: ProviderConfig,
  settings: ParsedAiProviderSettings | null,
  health: HealthSnapshot,
): AiProviderSummary => ({
  name: row.name,
  type: 'ai',
  source: 'database',
  enabled: row.enabled,
  priority: row.priority,
  capabilities: aiProviderCapabilities(row.capabilities),
  baseUrl: settings?.baseUrl ?? null,
  models: settings?.models ?? [],
  ...settingsSummary(settings),
  ...(legacyModelPricing(settings) ? { modelPricing: legacyModelPricing(settings) } : {}),
  credentialConfigured: Boolean(row.encryptedCredentials),
  health: health?.state ?? row.health ?? 'unknown',
  updatedAt: row.updatedAt?.toISOString?.() ?? null,
  checkedAt: health?.checkedAt?.toISOString?.() ?? null,
  latencyMs: health?.latencyMs ?? null,
  errorCode: health?.errorCode ?? null,
  ...(settings ? {} : { configError: '保存的 AI Provider 配置无效' }),
});

export { healthValue };
