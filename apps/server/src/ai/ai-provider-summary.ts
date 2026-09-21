import type { ProviderConfig } from '@prisma/client';
import type { AiProvider } from './contracts.js';
import {
  aiLegacyAdapterSchema,
  aiUpstreamSelectionSchema,
  type AiAdapter,
  type AiChatImplementation,
  type AiUpstreamFormat,
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
  type AiProviderCapabilityRevocation,
  type AiProviderExecutionRouteInput,
  type AiProviderModelReasoning,
  type AiProviderSummary,
} from './ai-provider.contracts.js';

export interface ParsedAiProviderSettings {
  baseUrl: string;
  models: string[];
  upstreamFormat: AiUpstreamFormat;
  chatImplementation?: AiChatImplementation;
  compatibilityExtensionProfile?: AiCompatibilityExtensionProfile;
  adapter: AiAdapter;
  executionRoutes?: AiProviderExecutionRouteInput[];
  capabilityRevocations?: AiProviderCapabilityRevocation[];
  modelReasoning?: Record<string, AiProviderModelReasoning>;
  timeoutMs?: number;
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
  const modelReasoning = parseModelReasoning(record.modelReasoning, models);
  const legacyAdapter = aiLegacyAdapterSchema.safeParse(record.adapter);
  const executionRoutes = parseExecutionRoutes(record.executionRoutes, models);
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
    upstreamFormat: selection.upstreamFormat,
    ...(selection.upstreamFormat === 'chat-completions'
      ? { chatImplementation: selection.chatImplementation }
      : {}),
    ...(compatibilityExtensionProfile ? { compatibilityExtensionProfile } : {}),
    adapter,
    ...(executionRoutes ? { executionRoutes } : {}),
    ...(capabilityRevocations ? { capabilityRevocations } : {}),
    ...(modelReasoning ? { modelReasoning } : {}),
    ...(typeof record.timeoutMs === 'number' ? { timeoutMs: record.timeoutMs } : {}),
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

type HealthSnapshot = {
  state: string;
  checkedAt?: Date | null;
  latencyMs?: number | null;
  errorCode?: string | null;
} | null;

const settingsSummary = (settings: ParsedAiProviderSettings | null) => ({
  ...(settings?.upstreamFormat === undefined ? {} : { upstreamFormat: settings.upstreamFormat }),
  ...(settings?.chatImplementation === undefined
    ? {}
    : { chatImplementation: settings.chatImplementation }),
  ...(settings?.executionRoutes === undefined
    ? {}
    : { executionRouteConfigs: settings.executionRoutes }),
  ...(settings?.modelReasoning === undefined ? {} : { modelReasoning: settings.modelReasoning }),
  ...(settings?.timeoutMs === undefined ? {} : { timeoutMs: settings.timeoutMs }),
  ...(settings?.costPer1kInput === undefined ? {} : { costPer1kInput: settings.costPer1kInput }),
  ...(settings?.costPer1kOutput === undefined ? {} : { costPer1kOutput: settings.costPer1kOutput }),
  ...(settings?.costCurrency === undefined ? {} : { costCurrency: settings.costCurrency }),
  ...(settings?.pricingVersion === undefined ? {} : { pricingVersion: settings.pricingVersion }),
});

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
  credentialConfigured: Boolean(row.encryptedCredentials),
  health: health?.state ?? row.health ?? 'unknown',
  updatedAt: row.updatedAt?.toISOString?.() ?? null,
  checkedAt: health?.checkedAt?.toISOString?.() ?? null,
  latencyMs: health?.latencyMs ?? null,
  errorCode: health?.errorCode ?? null,
  ...(settings ? {} : { configError: '保存的 AI Provider 配置无效' }),
});

export const aiProviderSummaryFromProvider = (provider: AiProvider): AiProviderSummary => ({
  name: provider.id,
  type: 'ai',
  source: 'environment',
  enabled: true,
  priority: provider.metadata?.priority ?? 100,
  capabilities: [...(provider.metadata?.capabilities ?? ['chat'])],
  baseUrl: provider.metadata?.baseURL ?? null,
  models: [...provider.models],
  ...(provider.metadata?.upstreamFormat === undefined
    ? {}
    : { upstreamFormat: provider.metadata.upstreamFormat }),
  ...(provider.metadata?.chatImplementation === undefined
    ? {}
    : { chatImplementation: provider.metadata.chatImplementation }),
  ...(provider.metadata?.executionRoutes === undefined
    ? {}
    : { executionRouteConfigs: [...provider.metadata.executionRoutes] }),
  ...(provider.metadata?.timeoutMs === undefined ? {} : { timeoutMs: provider.metadata.timeoutMs }),
  ...(provider.metadata?.costPer1kInput === undefined
    ? {}
    : { costPer1kInput: provider.metadata.costPer1kInput }),
  ...(provider.metadata?.costPer1kOutput === undefined
    ? {}
    : { costPer1kOutput: provider.metadata.costPer1kOutput }),
  ...(provider.metadata?.costCurrency === undefined
    ? {}
    : { costCurrency: provider.metadata.costCurrency }),
  ...(provider.metadata?.pricingVersion === undefined
    ? {}
    : { pricingVersion: provider.metadata.pricingVersion }),
  credentialConfigured: true,
  health: provider.metadata?.health ?? 'unknown',
  updatedAt: null,
  checkedAt: null,
  latencyMs: null,
  errorCode: null,
});

export { healthValue };
