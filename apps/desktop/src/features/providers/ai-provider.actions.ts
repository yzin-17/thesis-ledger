import type { ConfirmDialogOptions } from '@/components/ui/confirm-dialog';

import type {
  AiProviderModelDetail,
  AiProviderModelReasoning,
  AiProviderReasoningEffort,
  ProviderDraft,
  ProviderRecord,
} from './providers.types.js';

export type AiProviderInput = {
  name: string;
  baseUrl: string;
  models: string[];
  modelReasoning?: Record<string, AiProviderModelReasoning>;
  apiKey?: string;
  enabled: boolean;
  priority: number;
  capabilities: string[];
  timeoutMs?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  costCurrency?: string;
  pricingVersion?: string;
  connectionTestToken?: string;
};

const optionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
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
  none: '关闭',
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
): AiProviderInput => {
  const apiKey = draft.credentialsRef.trim();
  const timeoutMs = optionalNumber(draft.timeoutMs);
  const costPer1kInput = optionalNumber(draft.costPer1kInput);
  const costPer1kOutput = optionalNumber(draft.costPer1kOutput);
  const costCurrency = draft.costCurrency.trim();
  const pricingVersion = draft.pricingVersion.trim();
  const models = modelsFromText(draft.modelsText);
  const modelReasoning = selectedModelReasoning(models, draft.modelReasoning);
  return {
    name: draft.name.trim(),
    baseUrl: draft.baseUrl.trim(),
    models,
    enabled: draft.enabled,
    priority: Number(draft.priority),
    capabilities: draft.capabilities,
    ...(apiKey ? { apiKey } : {}),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(costPer1kInput === undefined ? {} : { costPer1kInput }),
    ...(costPer1kOutput === undefined ? {} : { costPer1kOutput }),
    ...(costCurrency ? { costCurrency } : {}),
    ...(pricingVersion ? { pricingVersion } : {}),
    ...(Object.keys(modelReasoning).length > 0 ? { modelReasoning } : {}),
    ...(connectionTestToken ? { connectionTestToken } : {}),
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
  modelsText: (provider.models ?? []).join('\n'),
  modelReasoning: selectedModelReasoning(provider.models ?? [], provider.modelReasoning ?? {}),
  timeoutMs: provider.timeoutMs?.toString() ?? '',
  costPer1kInput: provider.costPer1kInput?.toString() ?? '',
  costPer1kOutput: provider.costPer1kOutput?.toString() ?? '',
  costCurrency: provider.costCurrency ?? '',
  pricingVersion: provider.pricingVersion ?? '',
});

export const aiProviderDraftError = (input: AiProviderInput) => {
  if (!input.name) return '请填写 Provider 名称。';
  if (!input.baseUrl) return '请填写 API Base URL。';
  if (input.models.length === 0) return '请至少填写一个模型。';
  if (new Set(input.models).size !== input.models.length) return '模型不得重复。';
  if (input.capabilities.length === 0) return '请至少选择一项能力。';
  if (!Number.isInteger(input.priority) || input.priority < 0) return '优先级必须是非负整数。';
  if (input.timeoutMs !== undefined && (!Number.isInteger(input.timeoutMs) || input.timeoutMs <= 0))
    return '超时必须是正整数毫秒。';
  if (input.costPer1kInput !== undefined && input.costPer1kInput < 0) return '输入费用不能为负数。';
  if (input.costPer1kOutput !== undefined && input.costPer1kOutput < 0)
    return '输出费用不能为负数。';
  return null;
};

export const requestAiProviderDeletion = async (
  provider: ProviderRecord,
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>,
  remove: (name: string) => Promise<unknown>,
) => {
  if (provider.source === 'environment') return false;
  const confirmed = await confirm({
    title: `删除 ${provider.name}？`,
    description: '删除后该 Provider 不再参与后续 AI 请求；同名部署配置可能重新出现。',
    confirmLabel: '删除 Provider',
    cancelLabel: '取消',
    variant: 'destructive',
  });
  if (!confirmed) return false;
  await remove(provider.name);
  return true;
};
