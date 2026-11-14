import type { InstrumentDirectory } from './market.js';

type Context = {
  executionSymbol?: unknown;
  baselineStrategySchema?: unknown;
  discoveryScope?: unknown;
  source?: unknown;
  runConfig?: unknown;
  instrumentDirectory?: InstrumentDirectory | undefined;
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function optimizationExperimentSymbol(value: Context): string | null {
  const symbols = [
    value.executionSymbol,
    record(record(value.baselineStrategySchema).executionInstrument).symbol,
    record(record(value.discoveryScope).executionInstrument).symbol,
    record(record(record(value.source).discoveryScope).executionInstrument).symbol,
    record(record(record(value.runConfig).executionModel).scope).symbol,
  ];
  const symbol = symbols.find((item): item is string => typeof item === 'string' && !!item.trim());
  return symbol?.trim().toUpperCase() ?? null;
}

/** 当前目录名称只用于展示，不修改实验名称或冻结定义。 */
export function optimizationExperimentInstrumentLabel(value: Context): string | null {
  const symbol = optimizationExperimentSymbol(value);
  if (!symbol) return null;
  const name = value.instrumentDirectory?.items.find((item) => item.symbol === symbol)?.displayName;
  return name && name !== symbol ? `${name} · ${symbol}` : symbol;
}
