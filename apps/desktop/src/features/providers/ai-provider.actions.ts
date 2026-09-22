import type { ConfirmDialogOptions } from '@/components/ui/confirm-dialog';

import type {
  AiProviderExecutionRouteConfig,
  AiProviderModelDetail,
  AiProviderModelPricingDraft,
  AiProviderModelReasoning,
  AiProviderReasoningEffort,
  ProviderDraft,
  ProviderRecord,
} from './providers.types.js';
import {
  aiProviderExecutionRouteDraftFromConfig,
  aiProviderExecutionRouteInputFromDraft,
} from './ai-provider-execution.js';
import type {
  AiAuthMode,
  AiChatImplementation,
  AiGenerationContractRef,
  AiGenerationMode,
  AiProviderTestKind,
  AiUpstreamFormat,
} from '@thesis-ledger/schemas';

export type AiProviderInput = {
  name: string;
  baseUrl: string;
  models: string[];
  authMode: AiAuthMode;
  upstreamFormat: AiUpstreamFormat;
  chatImplementation?: AiChatImplementation;
  executionRoutes?: AiProviderExecutionRouteConfig[];
  modelDefaults?: Record<string, { mode: AiGenerationMode; outputPolicy?: 'auto' | 'manual' }>;
  modelPricing?: Record<
    string,
    {
      costPer1kInput?: number;
      costPer1kOutput?: number;
      costCurrency?: string;
    }
  >;
  modelReasoning?: Record<string, AiProviderModelReasoning>;
  apiKey?: string;
  enabled: boolean;
  priority: number;
  capabilities: string[];
  timeoutMs?: number;
  firstOutputTimeoutMs?: number;
  outputIdleTimeoutMs?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  costCurrency?: string;
  connectionTestToken?: string;
  expectedRevision?: string;
};

export type AiProviderTestInput = AiProviderInput & {
  model?: string;
  testKind?: AiProviderTestKind;
  purpose?: AiGenerationContractRef['id'];
  mode?: AiGenerationMode;
  budgetAuthorized?: boolean;
  requestId?: string;
};

const optionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export type AiProviderTestPricingState = 'unknown' | 'zero' | 'paid';

const numericPricingValue = (value: number | string | undefined) => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return Number(value);
};

export const aiProviderTestPricingState = (pricing?: {
  costPer1kInput?: number | string;
  costPer1kOutput?: number | string;
  costCurrency?: string;
}): AiProviderTestPricingState => {
  const input = numericPricingValue(pricing?.costPer1kInput);
  const output = numericPricingValue(pricing?.costPer1kOutput);
  if (
    input === undefined ||
    output === undefined ||
    !Number.isFinite(input) ||
    !Number.isFinite(output) ||
    input < 0 ||
    output < 0 ||
    !pricing?.costCurrency?.trim()
  )
    return 'unknown';
  return input === 0 && output === 0 ? 'zero' : 'paid';
};

export const modelsFromText = (value: string) =>
  value
    .split(/\r?\n/u)
    .map((model) => model.trim())
    .filter(Boolean);

export const modelsToText = (models: string[], limit = 32) =>
  Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)))
    .slice(0, limit)
    .join('\n');

export const mergeModelOptions = (selectedModels: string[], availableModels: string[]) =>
  Array.from(new Set([...availableModels, ...selectedModels]));

export const aiUpstreamFormatOptions = [
  { value: 'chat-completions', label: 'Chat Completions（需支持对应接口）' },
  { value: 'responses', label: 'Responses（原生）' },
  { value: 'anthropic-messages', label: 'Anthropic Messages（需支持对应接口）' },
] as const satisfies ReadonlyArray<{ value: AiUpstreamFormat; label: string }>;

export const aiChatImplementationOptions = [
  { value: 'compatible', label: '通用兼容' },
  { value: 'openai-native', label: 'OpenAI 原生' },
] as const satisfies ReadonlyArray<{ value: AiChatImplementation; label: string }>;

export const aiUpstreamFormatLabel = (value: AiUpstreamFormat) =>
  aiUpstreamFormatOptions.find((option) => option.value === value)?.label ?? value;

export const aiChatImplementationLabel = (value: AiChatImplementation) =>
  aiChatImplementationOptions.find((option) => option.value === value)?.label ?? value;

export const withAiUpstreamFormat = (
  draft: ProviderDraft,
  upstreamFormat: AiUpstreamFormat,
): ProviderDraft => ({
  ...draft,
  upstreamFormat,
  chatImplementation:
    upstreamFormat === 'chat-completions' ? (draft.chatImplementation ?? 'compatible') : undefined,
});

export const modelDetailsFromCatalog = (value: unknown): AiProviderModelDetail[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const detail = item as { id?: unknown; reasoning?: unknown };
    if (typeof detail.id !== 'string' || !detail.id.trim()) return [];
    if (!detail.reasoning || typeof detail.reasoning !== 'object') return [{ id: detail.id }];
    return [{ id: detail.id, reasoning: detail.reasoning as AiProviderModelReasoning }];
  });
};

export const selectedModelReasoning = (
  models: string[],
  modelReasoning: Record<string, AiProviderModelReasoning>,
) =>
  Object.fromEntries(
    models.flatMap((model) => {
      const reasoning = modelReasoning[model];
      return reasoning ? [[model, reasoning]] : [];
    }),
  );

export const mergeSelectedModelReasoning = (
  selectedModels: string[],
  savedModelReasoning: Record<string, AiProviderModelReasoning>,
  modelDetails: AiProviderModelDetail[],
) => {
  const detailsById = new Map(modelDetails.map((detail) => [detail.id, detail]));
  return Object.fromEntries(
    selectedModels.flatMap((model) => {
      const detail = detailsById.get(model);
      if (detail) return detail.reasoning ? [[model, detail.reasoning]] : [];
      const savedReasoning = savedModelReasoning[model];
      return savedReasoning ? [[model, savedReasoning]] : [];
    }),
  );
};

const reasoningEffortLabel: Record<AiProviderReasoningEffort, string> = {
  none: 'none',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
};

export const modelReasoningBadgeLabels = (reasoning?: AiProviderModelReasoning) => {
  if (!reasoning) return ['未声明推理'];
  const supportedEfforts = reasoning.supportedEfforts;
  const supportedLabels =
    supportedEfforts === null
      ? ['全部强度']
      : (supportedEfforts ?? []).flatMap((effort) => {
          const label = reasoningEffortLabel[effort];
          return label ? [label] : [];
        });
  const defaultEffort = reasoning.defaultEffort
    ? reasoningEffortLabel[reasoning.defaultEffort]
    : undefined;
  const defaultLabel = defaultEffort ? [`默认 ${defaultEffort}`] : [];
  const mandatoryLabel = reasoning.mandatory ? ['强制推理'] : [];
  const labels = [...supportedLabels, ...defaultLabel, ...mandatoryLabel];
  return labels.length > 0 ? labels : ['未声明推理'];
};

export const aiProviderInputFromDraft = (
  draft: ProviderDraft,
  connectionTestToken?: string,
  options?: { includeExpectedRevision?: boolean },
): AiProviderInput => {
  const apiKey = draft.credentialsRef.trim();
  const timeoutMs = optionalNumber(draft.timeoutMs);
  const firstOutputTimeoutMs = optionalNumber(draft.firstOutputTimeoutMs);
  const outputIdleTimeoutMs = optionalNumber(draft.outputIdleTimeoutMs);
  const costPer1kInput = optionalNumber(draft.costPer1kInput);
  const costPer1kOutput = optionalNumber(draft.costPer1kOutput);
  const costCurrency = draft.costCurrency.trim();
  const models = modelsFromText(draft.modelsText);
  const modelReasoning = selectedModelReasoning(models, draft.modelReasoning);
  const executionRoutes = draft.executionRoutes.map(aiProviderExecutionRouteInputFromDraft);
  const modelDefaults = Object.fromEntries(
    models.flatMap((model) => {
      const defaults = draft.modelDefaults[model];
      return defaults ? [[model, { ...defaults }] as const] : [];
    }),
  );
  const expectedRevision = draft.updatedAt.trim();
  const modelPricing = Object.fromEntries(
    models.flatMap((model) => {
      const pricing = draft.modelPricing[model];
      if (!pricing) return [];
      const costPer1kInput = optionalNumber(pricing.costPer1kInput);
      const costPer1kOutput = optionalNumber(pricing.costPer1kOutput);
      const costCurrency = pricing.costCurrency.trim();
      if (
        costPer1kInput === undefined &&
        costPer1kOutput === undefined &&
        costCurrency.length === 0
      )
        return [];
      return [
        [
          model,
          {
            ...(costPer1kInput === undefined ? {} : { costPer1kInput }),
            ...(costPer1kOutput === undefined ? {} : { costPer1kOutput }),
            ...(costCurrency ? { costCurrency } : {}),
          },
        ] as const,
      ];
    }),
  );
  return {
    name: draft.name.trim(),
    baseUrl: draft.baseUrl.trim(),
    models,
    authMode: draft.authMode,
    enabled: draft.enabled,
    priority: Number(draft.priority),
    capabilities: draft.capabilities,
    upstreamFormat: draft.upstreamFormat,
    ...(draft.upstreamFormat === 'chat-completions'
      ? { chatImplementation: draft.chatImplementation ?? 'compatible' }
      : {}),
    executionRoutes,
    ...(Object.keys(modelDefaults).length > 0 ? { modelDefaults } : {}),
    modelPricing,
    ...(draft.authMode === 'api_key' && apiKey ? { apiKey } : {}),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(firstOutputTimeoutMs === undefined ? {} : { firstOutputTimeoutMs }),
    ...(outputIdleTimeoutMs === undefined ? {} : { outputIdleTimeoutMs }),
    ...(costPer1kInput === undefined ? {} : { costPer1kInput }),
    ...(costPer1kOutput === undefined ? {} : { costPer1kOutput }),
    ...(costCurrency ? { costCurrency } : {}),
    ...(Object.keys(modelReasoning).length > 0 ? { modelReasoning } : {}),
    ...(options?.includeExpectedRevision === false || !expectedRevision
      ? {}
      : { expectedRevision }),
    ...(connectionTestToken ? { connectionTestToken } : {}),
  };
};

export const aiProviderTestInputFromDraft = (
  draft: ProviderDraft,
  model?: string,
  testKind: AiProviderTestKind = 'connection',
  budgetAuthorized?: boolean,
  purpose?: AiGenerationContractRef['id'],
  mode?: AiGenerationMode,
): AiProviderTestInput => ({
  ...aiProviderInputFromDraft(draft, undefined, { includeExpectedRevision: false }),
  ...(model === undefined ? {} : { model }),
  testKind,
  ...(budgetAuthorized === undefined ? {} : { budgetAuthorized }),
  ...(purpose === undefined ? {} : { purpose }),
  ...(mode === undefined ? {} : { mode }),
});

const modelPricingDraftFromRecord = (
  provider: ProviderRecord,
  model: string,
): AiProviderModelPricingDraft | undefined => {
  const pricing = provider.modelPricing?.[model];
  if (pricing) {
    return {
      costPer1kInput: pricing.costPer1kInput?.toString() ?? '',
      costPer1kOutput: pricing.costPer1kOutput?.toString() ?? '',
      costCurrency: pricing.costCurrency ?? '',
    };
  }

  const hasLegacyPricing =
    provider.costPer1kInput !== undefined ||
    provider.costPer1kOutput !== undefined ||
    Boolean(provider.costCurrency);
  if (!hasLegacyPricing) return undefined;
  return {
    costPer1kInput: provider.costPer1kInput?.toString() ?? '',
    costPer1kOutput: provider.costPer1kOutput?.toString() ?? '',
    costCurrency: provider.costCurrency ?? '',
  };
};

export const aiProviderDraftFromRecord = (provider: ProviderRecord): ProviderDraft => ({
  name: provider.name,
  type: 'ai',
  capabilities: [...provider.capabilities],
  credentialsRef: '',
  priority: provider.priority,
  enabled: provider.enabled,
  baseUrl: provider.baseUrl ?? '',
  authMode: provider.authMode ?? 'api_key',
  modelsText: (provider.models ?? []).join('\n'),
  modelReasoning: selectedModelReasoning(provider.models ?? [], provider.modelReasoning ?? {}),
  upstreamFormat: provider.upstreamFormat ?? 'chat-completions',
  chatImplementation:
    (provider.upstreamFormat ?? 'chat-completions') === 'chat-completions'
      ? (provider.chatImplementation ?? 'compatible')
      : undefined,
  executionRoutes: (provider.executionRouteConfigs ?? []).map(
    aiProviderExecutionRouteDraftFromConfig,
  ),
  modelDefaults: provider.modelDefaults ?? {},
  modelPricing: Object.fromEntries(
    (provider.models ?? []).flatMap((model) => {
      const pricing = modelPricingDraftFromRecord(provider, model);
      if (!pricing) return [];
      return [[model, pricing] as const];
    }),
  ),
  timeoutMs: provider.timeoutMs?.toString() ?? '',
  firstOutputTimeoutMs: provider.firstOutputTimeoutMs?.toString() ?? '',
  outputIdleTimeoutMs: provider.outputIdleTimeoutMs?.toString() ?? '',
  costPer1kInput: provider.costPer1kInput?.toString() ?? '',
  costPer1kOutput: provider.costPer1kOutput?.toString() ?? '',
  costCurrency: provider.costCurrency ?? '',
  pricingVersion: provider.pricingVersion ?? '',
  updatedAt: provider.updatedAt ?? '',
});

export const aiProviderDraftError = (input: AiProviderInput) => {
  if (!input.name) return '请填写 Provider 名称。';
  if (!input.baseUrl) return '请填写 API Base URL。';
  if (input.models.length === 0) return '请至少填写一个模型。';
  if (new Set(input.models).size !== input.models.length) return '模型不得重复。';
  if (input.capabilities.length === 0) return '请至少选择一项能力。';
  const selectedModels = new Set(input.models);
  const routeKeys = new Set<string>();
  for (const route of input.executionRoutes ?? []) {
    if (!selectedModels.has(route.model)) return '执行路由必须选择已配置的模型。';
    const routeKey = `${route.model}:${route.contract.id}`;
    if (routeKeys.has(routeKey)) return '同一模型、同一业务用途只能配置一条执行路由。';
    routeKeys.add(routeKey);
    if (
      route.firstOutputTimeoutMs !== undefined &&
      (!Number.isInteger(route.firstOutputTimeoutMs) ||
        route.firstOutputTimeoutMs <= 0 ||
        route.firstOutputTimeoutMs > 120_000)
    )
      return '首输出超时必须是 1 到 120000 毫秒的整数。';
    if (
      route.outputIdleTimeoutMs !== undefined &&
      (!Number.isInteger(route.outputIdleTimeoutMs) ||
        route.outputIdleTimeoutMs <= 0 ||
        route.outputIdleTimeoutMs > 120_000)
    )
      return '输出空闲超时必须是 1 到 120000 毫秒的整数。';
  }
  if (!Number.isInteger(input.priority) || input.priority < 0) return '优先级必须是非负整数。';
  if (
    input.timeoutMs !== undefined &&
    (!Number.isInteger(input.timeoutMs) || input.timeoutMs <= 0 || input.timeoutMs > 120_000)
  )
    return '超时必须是 1 到 120000 毫秒的整数。';
  if (
    input.firstOutputTimeoutMs !== undefined &&
    (!Number.isInteger(input.firstOutputTimeoutMs) ||
      input.firstOutputTimeoutMs <= 0 ||
      input.firstOutputTimeoutMs > 120_000)
  )
    return '首输出默认超时必须是 1 到 120000 毫秒的整数。';
  if (
    input.outputIdleTimeoutMs !== undefined &&
    (!Number.isInteger(input.outputIdleTimeoutMs) ||
      input.outputIdleTimeoutMs <= 0 ||
      input.outputIdleTimeoutMs > 120_000)
  )
    return '输出空闲默认超时必须是 1 到 120000 毫秒的整数。';
  if (input.costPer1kInput !== undefined && input.costPer1kInput < 0) return '输入费用不能为负数。';
  if (input.costPer1kOutput !== undefined && input.costPer1kOutput < 0)
    return '输出费用不能为负数。';
  return null;
};

export const requestAiProviderDeletion = async (
  provider: ProviderRecord,
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>,
  remove: (
    name: string,
    expectedRevision?: string,
    lifecycle?: { clearResearchDefault?: boolean; expectedSettingsRevision?: string },
  ) => Promise<unknown>,
  lifecycle?: { clearResearchDefault?: boolean; expectedSettingsRevision?: string },
) => {
  if (provider.source === 'environment') return false;
  const confirmed = await confirm({
    title: `删除 ${provider.name}？`,
    description:
      lifecycle?.clearResearchDefault === true
        ? '该 Provider 是研究默认模型；确认后会在同一事务清除默认引用并删除 Provider。'
        : '删除后该 Provider 不再参与后续 AI 请求；同名部署配置可能重新出现。',
    confirmLabel: '删除 Provider',
    cancelLabel: '取消',
    variant: 'destructive',
  });
  if (!confirmed) return false;
  if (provider.updatedAt) {
    if (lifecycle) await remove(provider.name, provider.updatedAt, lifecycle);
    else await remove(provider.name, provider.updatedAt);
  } else if (lifecycle) await remove(provider.name, undefined, lifecycle);
  else await remove(provider.name);
  return true;
};
