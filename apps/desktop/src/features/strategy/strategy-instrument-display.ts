import type { InstrumentDirectory } from '@thesis-ledger/schemas';
import type { StrategyVersion } from './strategy.types.js';
import { schemaSymbols } from './strategy.schema.js';

export function strategyInstrumentName(directory: InstrumentDirectory | undefined, symbol: string) {
  return directory?.items.find((item) => item.symbol === symbol.trim().toUpperCase())?.displayName;
}

export function strategyInstrumentLabel(directory: InstrumentDirectory | undefined, symbol: string) {
  const name = strategyInstrumentName(directory, symbol);
  return name && name !== symbol ? `${name} · ${symbol}` : symbol;
}

export function strategyVersionInstruments(version: StrategyVersion | null | undefined) {
  return schemaSymbols(version?.schema ?? {}).map((symbol) =>
    strategyInstrumentLabel(version?.instrumentDirectory, symbol));
}
