import type { AiUpstreamFormat } from '@thesis-ledger/schemas';
import type { AiAuthMode } from '@thesis-ledger/schemas';
import {
  asRecord,
  type AiProviderModelCatalogItem,
  type AiProviderModelReasoning,
  type ReasoningEffort,
} from './ai-provider.contracts.js';

const MAX_MODEL_COUNT = 2_000;
const MAX_MODEL_ID_LENGTH = 200;

const modelsUrl = (baseUrl: string) => `${baseUrl.replace(/\/+$/u, '')}/models`;

const requestHeaders = (
  credential: string,
  upstreamFormat: AiUpstreamFormat,
  authMode: AiAuthMode,
) => {
  if (upstreamFormat === 'anthropic-messages')
    return {
      ...(authMode === 'api_key' && credential ? { 'x-api-key': credential } : {}),
      'anthropic-version': '2023-06-01',
    };
  if (authMode === 'api_key' && credential) return { authorization: `Bearer ${credential}` };
  return {};
};

const providerError = (payload: unknown) => {
  const error = asRecord(asRecord(payload)?.error);
  return typeof error?.message === 'string' ? error.message : null;
};

const reasoningEfforts: readonly ReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

const parseReasoning = (value: unknown): AiProviderModelReasoning | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;
  const reasoning: Partial<AiProviderModelReasoning> = {};
  const rawSupportedEfforts = record.supported_efforts;
  if (Object.hasOwn(record, 'supported_efforts')) {
    if (rawSupportedEfforts === null) reasoning.supportedEfforts = null;
    else if (Array.isArray(rawSupportedEfforts)) {
      const supported = reasoningEfforts.filter((effort) => rawSupportedEfforts.includes(effort));
      if (supported.length > 0) reasoning.supportedEfforts = supported;
    }
  }
  if (reasoningEfforts.includes(record.default_effort as ReasoningEffort))
    reasoning.defaultEffort = record.default_effort as ReasoningEffort;
  if (typeof record.default_enabled === 'boolean')
    reasoning.defaultEnabled = record.default_enabled;
  if (typeof record.supports_max_tokens === 'boolean')
    reasoning.supportsMaxTokens = record.supports_max_tokens;
  if (typeof record.mandatory === 'boolean') reasoning.mandatory = record.mandatory;
  return Object.keys(reasoning).length > 0 ? reasoning : undefined;
};

export const fetchAiProviderModelCatalog = async (
  baseUrl: string,
  credential: string,
  timeoutMs: number,
  upstreamFormat: AiUpstreamFormat = 'chat-completions',
  authMode: AiAuthMode = 'api_key',
) => {
  const response = await fetch(modelsUrl(baseUrl), {
    method: 'GET',
    headers: requestHeaders(credential, upstreamFormat, authMode),
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  const upstreamError = providerError(payload);
  if (!response.ok || upstreamError)
    throw new Error(upstreamError ?? `Provider 模型接口返回 HTTP ${response.status}`);

  const data = asRecord(payload)?.data;
  if (!Array.isArray(data)) throw new Error('Provider 模型接口响应缺少 data 数组');
  if (data.length > MAX_MODEL_COUNT)
    throw new Error(`Provider 模型目录超过 ${MAX_MODEL_COUNT} 条上限`);

  const models = data.map((item) => {
    const model = asRecord(item);
    const id = model?.id;
    if (typeof id !== 'string') throw new Error('Provider 模型目录包含无效模型 ID');
    const normalized = id.trim();
    if (!normalized || normalized.length > MAX_MODEL_ID_LENGTH)
      throw new Error('Provider 模型目录包含无效模型 ID');
    const reasoning = parseReasoning(model?.reasoning);
    return reasoning ? { id: normalized, reasoning } : { id: normalized };
  });
  const uniqueModels = new Map<string, AiProviderModelCatalogItem>();
  for (const model of models) {
    const current = uniqueModels.get(model.id);
    if (!current || (!current.reasoning && model.reasoning)) uniqueModels.set(model.id, model);
  }
  const modelDetails = [...uniqueModels.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const modelIds = modelDetails.map(({ id }) => id);
  if (modelIds.length === 0) throw new Error('Provider 模型目录为空');
  return { models: modelIds, modelDetails };
};
