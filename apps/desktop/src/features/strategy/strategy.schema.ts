import { strategySchema } from '@thesis-ledger/schemas';
import type { StrategySchema, StrategyVersion } from './strategy.types.js';

export const createDefaultStrategySchema = (name = '我的第一条策略'): StrategySchema => ({
  schemaVersion: '2',
  name,
  description: '示例规则：收盘价高于开盘价时入场，持仓时退出；保存前请核对。',
  signalSources: [
    {
      id: 'execution',
      asset: { symbol: '', market: 'CN', assetType: 'stock' },
      timeframe: '1d',
      series: ['open', 'close'],
    },
  ],
  executionInstrument: { symbol: '', market: 'CN', assetType: 'stock' },
  primaryTimeframe: '1d',
  entry: {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'execution', field: 'close' },
    right: { type: 'series', sourceId: 'execution', field: 'open' },
  },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'fixedAmount', amount: '10000' },
  risk: [],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0.0003', slippageRate: '0.001' },
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
  const instrument = schema.executionInstrument;
  if (!instrument || typeof instrument !== 'object' || Array.isArray(instrument)) return [];
  const symbol = (instrument as { symbol?: unknown }).symbol;
  return typeof symbol === 'string' && symbol.trim() ? [symbol] : [];
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const setStrategyExecutionSymbol = (schema: StrategySchema, symbol: string) => ({
  ...schema,
  executionInstrument: { ...asRecord(schema.executionInstrument), symbol },
  signalSources: Array.isArray(schema.signalSources)
    ? schema.signalSources.map((source: unknown) => {
        const record = asRecord(source);
        if (record.id !== 'execution') return source;
        return { ...record, asset: { ...asRecord(record.asset), symbol } };
      })
    : [],
});

export const setStrategyExecutionAssetType = (
  schema: StrategySchema,
  assetType: 'stock' | 'etf',
) => ({
  ...schema,
  executionInstrument: { ...asRecord(schema.executionInstrument), assetType },
  signalSources: Array.isArray(schema.signalSources)
    ? schema.signalSources.map((source: unknown) => {
        const record = asRecord(source);
        if (record.id !== 'execution') return source;
        return { ...record, asset: { ...asRecord(record.asset), assetType } };
      })
    : [],
});

export const setStrategyPrimaryTimeframe = (schema: StrategySchema, timeframe: string) => ({
  ...schema,
  primaryTimeframe: timeframe,
  signalSources: Array.isArray(schema.signalSources)
    ? schema.signalSources.map((source: unknown) => {
        const record = asRecord(source);
        return record.id === 'execution' ? { ...record, timeframe } : source;
      })
    : [],
});

export const schemaAsOf = (schema: StrategySchema) => {
  void schema;
  return '未知';
};

export const validateStrategySchema = (schema: StrategySchema) => {
  const parsed = strategySchema.safeParse(schema);
  if (parsed.success) return { schema: parsed.data as StrategySchema, error: null };
  const issue = parsed.error.issues[0];
  const path = issue?.path.length ? issue.path.join('.') : 'Schema';
  return { schema: null, error: `${path}：${issue?.message ?? '格式无效'}` };
};

export const latestVersion = (versions: StrategyVersion[]) =>
  [...versions].sort((left, right) => right.version - left.version)[0] ?? null;
