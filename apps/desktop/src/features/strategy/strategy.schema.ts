import { strategySchemaV1 } from '@thesis-ledger/schemas';
import type { StrategySchema, StrategyVersion } from './strategy.types.js';

export const createDefaultStrategySchema = (name = '我的第一条策略'): StrategySchema => ({
  version: 1,
  name,
  status: 'draft',
  description: '',
  universe: { symbols: ['600519.SH'], asOf: new Date().toISOString() },
  entrySignals: [{ indicator: 'close', operator: 'gt', value: 10 }],
  exitSignals: [{ indicator: 'close', operator: 'lt', value: 9 }],
  stopLoss: { type: 'fixed', value: 0.1 },
  sizing: { type: 'weight', value: 0.5 },
  execution: { price: 'close', tPlusOne: true, lotSize: 100 },
  cost: {
    commissionRate: 0.0003,
    minimumCommission: 5,
    stampDutyRate: 0.0005,
    slippageRate: 0.001,
  },
  riskConstraints: [],
  benchmark: '000300.SH',
});

export const schemaFromVersion = (version: StrategyVersion | null, fallbackName?: string) => {
  if (version?.schema) {
    const schema = structuredClone(version.schema);
    if (fallbackName) schema.name = fallbackName;
    return schema;
  }
  return createDefaultStrategySchema(fallbackName);
};

export const schemaName = (schema: StrategySchema, fallback = '') =>
  typeof schema.name === 'string' ? schema.name : fallback;

export const schemaSymbols = (schema: StrategySchema) => {
  const universe = schema.universe;
  if (!universe || typeof universe !== 'object' || Array.isArray(universe)) return [];
  const symbols = (universe as { symbols?: unknown }).symbols;
  return Array.isArray(symbols)
    ? symbols.filter((symbol): symbol is string => typeof symbol === 'string')
    : [];
};

export const schemaAsOf = (schema: StrategySchema) => {
  const universe = schema.universe;
  if (!universe || typeof universe !== 'object' || Array.isArray(universe)) return '未知';
  const asOf = (universe as { asOf?: unknown }).asOf;
  return typeof asOf === 'string' ? asOf : '未知';
};

export const validateStrategySchema = (schema: StrategySchema) => {
  const parsed = strategySchemaV1.safeParse(schema);
  if (parsed.success) return { schema: parsed.data as StrategySchema, error: null };
  const issue = parsed.error.issues[0];
  const path = issue?.path.length ? issue.path.join('.') : 'Schema';
  return { schema: null, error: `${path}：${issue?.message ?? '格式无效'}` };
};

export const latestVersion = (versions: StrategyVersion[]) =>
  [...versions].sort((left, right) => right.version - left.version)[0] ?? null;
