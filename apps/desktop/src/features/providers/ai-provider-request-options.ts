import {
  aiModelRequestOptionsSchema,
  type AiModelRequestOptions,
  type AiProviderModelDefaultConfig,
} from '@thesis-ledger/schemas';
import type { ProviderDraft, ProviderRecord } from './providers.types.js';

export const parseRequestOptionsText = (text: string): AiModelRequestOptions => {
  if (!text.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('请求参数必须是有效的JSON对象');
  }
  const parsed = aiModelRequestOptionsSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? '请求参数无效');
  return parsed.data;
};

export const requestOptionsTextFor = (draft: ProviderDraft, model: string): string => {
  const edited = draft.modelRequestOptionsText?.[model];
  if (edited !== undefined) return edited;
  const options = draft.modelDefaults[model]?.requestOptions;
  return options === undefined ? '' : JSON.stringify(options, null, 2);
};

export const requestOptionsDraftFromRecord = (provider: ProviderRecord) =>
  Object.fromEntries(
    Object.entries(provider.modelDefaults ?? {}).flatMap(([model, defaults]) =>
      defaults.requestOptions === undefined
        ? []
        : [[model, JSON.stringify(defaults.requestOptions, null, 2)]],
    ),
  );

export const modelDefaultsFromDraft = (
  draft: ProviderDraft,
  models: string[],
): Record<string, AiProviderModelDefaultConfig> =>
  Object.fromEntries(
    models.flatMap((model) => {
      const defaults = draft.modelDefaults[model];
      const text = draft.modelRequestOptionsText?.[model];
      if (text === undefined) return defaults ? [[model, { ...defaults }]] : [];
      const route = draft.executionRoutes.find((item) => item.model === model);
      const requestOptions = parseRequestOptionsText(text);
      return [
        [
          model,
          {
            ...defaults,
            mode: defaults?.mode ?? route?.mode ?? 'native_schema',
            outputPolicy: defaults?.outputPolicy ?? route?.outputPolicy ?? 'auto',
            requestOptions,
          },
        ],
      ];
    }),
  );
