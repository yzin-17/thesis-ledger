import {
  aiProviderInputSchema,
  type AiProviderRecord,
  type AiProviderSaveInput,
} from '@thesis-ledger/schemas';
const json = (value: unknown) => JSON.stringify(value ?? {}, null, 2);
function connectionDraft(row?: AiProviderRecord) {
  return {
    name: row?.name ?? '',
    baseUrl: row?.baseUrl ?? '',
    authMode: row?.authMode ?? 'api_key',
    upstreamFormat: row?.upstreamFormat ?? 'chat-completions',
    chatImplementation: row?.chatImplementation ?? 'compatible',
    compatibility: row?.compatibilityExtensionProfile === 'openrouter-v1',
    enabled: row?.enabled ?? false,
    priority: String(row?.priority ?? 100),
    capabilities: row?.capabilities.join(',') ?? 'chat',
  };
}
function modelDraft(row?: AiProviderRecord) {
  return {
    models: row?.models?.join('\n') ?? '',
    executionRoutes: JSON.stringify(row?.executionRouteConfigs ?? [], null, 2),
    modelDefaults: json(row?.modelDefaults),
    modelReasoning: json(row?.modelReasoning),
    modelPricing: json(
      row?.modelPricing &&
        Object.fromEntries(
          Object.entries(row.modelPricing).map(([model, price]) => [
            model,
            {
              costPer1kInput: price.costPer1kInput,
              costPer1kOutput: price.costPer1kOutput,
              costCurrency: price.costCurrency,
            },
          ]),
        ),
    ),
  };
}
export function aiProviderDraft(row?: AiProviderRecord) {
  return {
    ...connectionDraft(row),
    ...modelDraft(row),
    timeoutMs: String(row?.timeoutMs ?? ''),
    firstOutputTimeoutMs: String(row?.firstOutputTimeoutMs ?? ''),
    outputIdleTimeoutMs: String(row?.outputIdleTimeoutMs ?? ''),
  };
}
export type AiProviderDraft = ReturnType<typeof aiProviderDraft>;
export function buildAiProviderInput(
  draft: AiProviderDraft,
  apiKey: string,
  row?: AiProviderRecord,
): AiProviderSaveInput {
  const timeout = (value: string) => (value.trim() ? Number(value) : undefined);
  const input = {
    name: draft.name.trim(),
    baseUrl: draft.baseUrl.trim(),
    models: draft.models
      .split(/[\n,]/u)
      .map((v) => v.trim())
      .filter(Boolean),
    authMode: draft.authMode,
    upstreamFormat: draft.upstreamFormat,
    ...(draft.upstreamFormat === 'chat-completions'
      ? { chatImplementation: draft.chatImplementation }
      : {}),
    ...(draft.compatibility ? { compatibilityExtensionProfile: 'openrouter-v1' as const } : {}),
    enabled: draft.enabled,
    priority: Number(draft.priority),
    capabilities: draft.capabilities
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    timeoutMs: timeout(draft.timeoutMs),
    firstOutputTimeoutMs: timeout(draft.firstOutputTimeoutMs),
    outputIdleTimeoutMs: timeout(draft.outputIdleTimeoutMs),
    executionRoutes: JSON.parse(draft.executionRoutes) as unknown,
    modelPricing: JSON.parse(draft.modelPricing) as unknown,
    modelDefaults: JSON.parse(draft.modelDefaults) as unknown,
    modelReasoning: JSON.parse(draft.modelReasoning) as unknown,
    ...(draft.authMode === 'api_key' && apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    ...(row?.updatedAt ? { expectedRevision: row.updatedAt } : {}),
  };
  return aiProviderInputSchema.parse(input);
}
export function researchCandidateReason(
  row: AiProviderRecord | undefined,
  model: string,
  priceConfigured: boolean,
) {
  if (!row?.enabled) return '来源已停用';
  if (row.authMode !== 'none' && !row.credentialConfigured) return '凭证未配置';
  if (!priceConfigured) return '模型费用尚未填写完整';
  const execution = row.executionRoutes?.find(
    (item) => item.model === model && item.contract.id === 'research',
  );
  if (execution?.readiness.state !== 'ready') return '研究用途尚未就绪';
  return null;
}
