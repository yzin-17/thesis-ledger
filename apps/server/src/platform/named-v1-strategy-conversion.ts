import type { BacktestStrategy } from '@thesis-ledger/schemas';
import { strategySchema } from '@thesis-ledger/schemas';
import { canonicalizeManifest } from '../backtest/backtest-snapshot.js';

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;

type Conversion =
  | { outcome: 'current' | 'convert'; definition: BacktestStrategy }
  | { outcome: 'delete'; reason: string }
  | { outcome: 'blocked'; reason: string };

/** 在一次性预览中读取旧结构，只转换已有且可证明含义的字段。 */
export function convertStrategyDefinition(
  storageVersion: number,
  input: unknown,
): Conversion {
  const raw = record(input);
  if (storageVersion === 1) {
    const parsed = strategySchema.safeParse(raw);
    return parsed.success
      ? { outcome: 'current', definition: parsed.data as BacktestStrategy }
      : { outcome: 'blocked', reason: '当前策略定义损坏' };
  }
  if (storageVersion !== 2 && storageVersion !== 3)
    return { outcome: 'delete', reason: '缺少可识别的旧策略定义合同' };
  if (!raw || raw.schemaVersion !== String(storageVersion) || !Array.isArray(raw.signalSources))
    return { outcome: 'delete', reason: '策略列版本与原定义不一致' };

  const candidate: JsonRecord = { ...structuredClone(raw), schemaVersion: 'strategy-definition-v1' };
  if (storageVersion === 2) {
    const sources: JsonRecord[] = [];
    for (const value of raw.signalSources) {
      const source = record(value);
      const asset = record(source?.asset);
      if (!source || !asset || !Array.isArray(source.series) || !source.series.length)
        return { outcome: 'delete', reason: '旧策略来源或字段缺失' };
      const coordinate = asset.assetType === 'fund' ? 'native-nav' : 'run';
      if (source.priceCoordinate !== undefined && source.priceCoordinate !== coordinate)
        return { outcome: 'delete', reason: '旧来源声明与原运行价格绑定冲突' };
      sources.push({ ...source, priceCoordinate: coordinate });
    }
    if (!sources.some((source) => source.timeframe === raw.primaryTimeframe))
      return { outcome: 'delete', reason: '旧定义缺少主周期来源' };
    candidate.signalSources = sources;
  }

  const plan = record(candidate.tradePlan);
  for (const name of ['initialStop', 'trailing'] as const) {
    const protection = record(plan?.[name]);
    if (!protection || !Object.hasOwn(protection, 'activateWhen')) continue;
    if (Object.hasOwn(protection, 'activation'))
      return { outcome: 'delete', reason: '同一保护项保存了两种启用配置' };
    protection.activation = { kind: 'condition', condition: protection.activateWhen };
    delete protection.activateWhen;
  }

  const parsed = strategySchema.safeParse(candidate);
  if (!parsed.success)
    return { outcome: 'delete', reason: parsed.error.issues.map((issue) => issue.path.join('.')).join('、') };
  if (canonicalizeManifest(parsed.data) !== canonicalizeManifest(candidate))
    return { outcome: 'delete', reason: '解析会改变其他配置字段' };
  return { outcome: 'convert', definition: parsed.data as BacktestStrategy };
}
