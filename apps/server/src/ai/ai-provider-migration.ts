import type { AiProviderModelPricingInput } from './ai-provider.contracts.js';

export type AiProviderMigrationRow = {
  name: string;
  settings: unknown;
};

export type AiProviderMigrationStatus = 'noop' | 'ready' | 'conflict';

export type AiProviderMigrationPlan = {
  name: string;
  status: AiProviderMigrationStatus;
  legacyPricing: AiProviderModelPricingInput | null;
  proposedModelPricing: Record<string, AiProviderModelPricingInput>;
  preservedModels: string[];
  conflicts: string[];
};

export type AiProviderMigrationReport = {
  dryRun: true;
  items: AiProviderMigrationPlan[];
  summary: {
    providers: number;
    noop: number;
    ready: number;
    conflicts: number;
  };
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const hasOwn = (record: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(record, key);

const collectLegacyPricing = (record: Record<string, unknown>) => {
  const conflicts: string[] = [];
  const pricing: AiProviderModelPricingInput = {};
  const numericFields = ['costPer1kInput', 'costPer1kOutput'] as const;
  let hasLegacyValue = false;

  for (const field of numericFields) {
    if (!hasOwn(record, field)) continue;
    hasLegacyValue = true;
    const value = record[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      conflicts.push(`旧字段 ${field} 不是有效的非负数`);
      continue;
    }
    pricing[field] = value;
  }

  if (hasOwn(record, 'costCurrency')) {
    hasLegacyValue = true;
    const value = record.costCurrency;
    if (typeof value !== 'string' || !value.trim()) conflicts.push('旧字段 costCurrency 为空');
    else pricing.costCurrency = value.trim();
  }

  if (hasLegacyValue) {
    if (pricing.costPer1kInput === undefined) conflicts.push('旧价格缺少输入单价，不补零');
    if (pricing.costPer1kOutput === undefined) conflicts.push('旧价格缺少输出单价，不补零');
    if (pricing.costCurrency === undefined) conflicts.push('旧价格缺少币种，不补默认值');
  }

  return {
    pricing: hasLegacyValue ? pricing : null,
    conflicts,
  };
};

const inspectRoutes = (value: unknown) => {
  const conflicts: string[] = [];
  if (value === undefined) return conflicts;
  if (!Array.isArray(value)) return ['旧 executionRoutes 不是数组，不能安全迁移'];

  const keys = new Set<string>();
  for (const [index, item] of value.entries()) {
    const route = asRecord(item);
    const contract = route ? asRecord(route.contract) : null;
    const model = route?.model;
    const purpose = contract?.id;
    if (typeof model !== 'string' || typeof purpose !== 'string') {
      conflicts.push(`executionRoutes[${index}] 缺少模型或业务用途，保留原值`);
      continue;
    }
    const key = `${model}\u0000${purpose}`;
    if (keys.has(key)) conflicts.push(`模型 ${model} 的用途 ${purpose} 存在重复路由`);
    keys.add(key);
  }
  return conflicts;
};

export const planAiProviderMigration = (row: AiProviderMigrationRow): AiProviderMigrationPlan => {
  const conflicts = [] as string[];
  const record = asRecord(row.settings);
  if (!record) {
    return {
      name: row.name,
      status: 'conflict',
      legacyPricing: null,
      proposedModelPricing: {},
      preservedModels: [],
      conflicts: ['Provider settings 不是对象，保留原值'],
    };
  }

  const modelsValue = record.models;
  const models = Array.isArray(modelsValue)
    ? modelsValue.filter((model): model is string =>
        typeof model === 'string' && Boolean(model.trim()),
      )
    : [];
  if (!Array.isArray(modelsValue) || models.length !== modelsValue.length || models.length === 0)
    conflicts.push('模型列表无效，不能安全迁移价格');

  const existingModelPricingValue = record.modelPricing;
  let existingModelPricing: Record<string, unknown> = {};
  if (existingModelPricingValue !== undefined) {
    const parsed = asRecord(existingModelPricingValue);
    if (!parsed) conflicts.push('已有 modelPricing 结构无效，保留原值');
    else existingModelPricing = parsed;
  }

  const legacy = collectLegacyPricing(record);
  conflicts.push(...legacy.conflicts);
  conflicts.push(...inspectRoutes(record.executionRoutes));

  const proposedModelPricing: Record<string, AiProviderModelPricingInput> = {};
  const preservedModels: string[] = [];
  if (legacy.pricing) {
    for (const model of models) {
      if (hasOwn(existingModelPricing, model)) {
        preservedModels.push(model);
        continue;
      }
      proposedModelPricing[model] = { ...legacy.pricing };
    }
  }

  let status: AiProviderMigrationStatus = 'noop';
  if (conflicts.length > 0) status = 'conflict';
  else if (Object.keys(proposedModelPricing).length > 0) status = 'ready';

  return {
    name: row.name,
    status,
    legacyPricing: legacy.pricing,
    proposedModelPricing,
    preservedModels,
    conflicts,
  };
};

export const planAiProviderMigrations = (
  rows: readonly AiProviderMigrationRow[],
): AiProviderMigrationReport => {
  const items = rows.map(planAiProviderMigration);
  return {
    dryRun: true,
    items,
    summary: {
      providers: items.length,
      noop: items.filter((item) => item.status === 'noop').length,
      ready: items.filter((item) => item.status === 'ready').length,
      conflicts: items.filter((item) => item.status === 'conflict').length,
    },
  };
};
