import { BadRequestException } from '@nestjs/common';
import {
  aiModelRequestOptionsSchema,
  type AiModelRequestOptions,
  type AiProviderModelDefaultConfig,
} from '@thesis-ledger/schemas';

type Options = { requestOptions?: AiModelRequestOptions | undefined };
type Pricing = {
  costPer1kInput?: number | undefined;
  costPer1kOutput?: number | undefined;
  costCurrency?: string | undefined;
};

export const aiRequestOptionsFields = (value: Options = {}) =>
  value.requestOptions === undefined ? {} : { requestOptions: value.requestOptions };

export const modelRequestOptionsFields = (
  defaults: Readonly<Record<string, AiProviderModelDefaultConfig>> | undefined,
  model: string,
) => aiRequestOptionsFields(defaults?.[model]);

/** 旧客户端省略时保留；显式{}表示用户清除。移除模型仍由原过滤规则处理。 */
export const mergeModelRequestOptionsDefaults = (
  input: Record<string, AiProviderModelDefaultConfig> | undefined,
  stored: Record<string, AiProviderModelDefaultConfig> | undefined,
  models: readonly string[],
) => {
  const defaults = input ?? stored;
  if (!defaults) return undefined;
  const selected = new Set(models);
  return Object.fromEntries(
    Object.entries(defaults)
      .filter(([model]) => selected.has(model))
      .map(([model, value]) => [
      model,
      value.requestOptions === undefined && stored?.[model]?.requestOptions !== undefined
        ? { ...value, requestOptions: stored[model].requestOptions }
        : value,
    ]),
  );
};

export const invalidStoredModelRequestOptions = (value: unknown, models: string[]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).some(([model, defaults]) => {
    if (
      !models.includes(model) ||
      !defaults ||
      typeof defaults !== 'object' ||
      Array.isArray(defaults)
    )
      return false;
    const options = (defaults as Record<string, unknown>).requestOptions;
    return options !== undefined && !aiModelRequestOptionsSchema.safeParse(options).success;
  });
};

export const modelRequestOptionsIssue = (
  options: AiModelRequestOptions | undefined,
  adapter: string | null,
  pricing: Pricing,
): string | undefined => {
  if (!options) return undefined;
  if (!aiModelRequestOptionsSchema.safeParse(options).success) return '模型请求参数无效';
  if (options.outputTokenLimit !== 'upstream') return undefined;
  if (adapter === 'anthropic-messages') return 'Anthropic Messages 必须指定输出上限';
  if (
    pricing.costPer1kInput !== 0 ||
    pricing.costPer1kOutput !== 0 ||
    !/^[A-Z]{3}$/u.test(pricing.costCurrency ?? '')
  )
    return '上游默认输出上限仅适用于明确配置输入和输出零价格的模型';
  return undefined;
};

export const assertModelRequestOptions = (
  input: {
    modelDefaults?: Record<string, AiProviderModelDefaultConfig> | undefined;
    modelPricing?: Record<string, Pricing> | undefined;
    costPer1kInput?: number | undefined;
    costPer1kOutput?: number | undefined;
    costCurrency?: string | undefined;
  },
  adapter: string | null,
) => {
  for (const [model, defaults] of Object.entries(input.modelDefaults ?? {})) {
    const pricing = input.modelPricing?.[model] ?? {
      ...(input.costPer1kInput === undefined ? {} : { costPer1kInput: input.costPer1kInput }),
      ...(input.costPer1kOutput === undefined ? {} : { costPer1kOutput: input.costPer1kOutput }),
      ...(input.costCurrency === undefined ? {} : { costCurrency: input.costCurrency }),
    };
    const issue = modelRequestOptionsIssue(defaults.requestOptions, adapter, pricing);
    if (issue) throw new BadRequestException(`${model}：${issue}`);
  }
};

export const readFrozenRequestOptions = (value: { requestOptions?: unknown }) => {
  if (value.requestOptions === undefined) return {};
  return { requestOptions: aiModelRequestOptionsSchema.parse(value.requestOptions) };
};
