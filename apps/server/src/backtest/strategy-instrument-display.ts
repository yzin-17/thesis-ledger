import type { InstrumentDirectory } from '@thesis-ledger/schemas';
import type { InstrumentDisplayService } from '../market/instruments/instrument-display.service.js';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};

function symbolsForVersion(version: { schema?: unknown }): string[] {
  const schema = record(version.schema);
  const sources = Array.isArray(schema.signalSources) ? schema.signalSources : [];
  return [...new Set([record(schema.executionInstrument).symbol,
    ...sources.map((source) => record(record(source).asset).symbol)]
    .filter((symbol): symbol is string => typeof symbol === 'string' && !!symbol.trim())
    .map((symbol) => symbol.trim().toUpperCase()))];
}

/** 当前名称只附加到读取响应，保留版本定义及其冻结语义。 */
export async function nameStrategyVersions<T extends { schema?: unknown }>(
  versions: readonly T[], display: InstrumentDisplayService,
): Promise<Array<T & { instrumentDirectory: InstrumentDirectory }>> {
  const symbols = versions.map(symbolsForVersion);
  const directory = await display.resolveDirectory([...new Set(symbols.flat())]);
  return versions.map((version, index) => {
    const scope = new Set(symbols[index]);
    return { ...version, instrumentDirectory: {
      generation: directory.generation,
      items: directory.items.filter((item) => scope.has(item.symbol)),
      unresolvedSymbols: directory.unresolvedSymbols.filter((symbol) => scope.has(symbol)),
    } };
  });
}
