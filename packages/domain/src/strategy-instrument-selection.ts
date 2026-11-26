export type StrategyInstrumentMode = 'exchange' | 'nav';
export type StrategyExecutionInstrument = {
  symbol: string;
  market: 'CN' | 'HK' | 'US';
  assetType: 'stock' | 'etf' | 'fund';
};

export const strategyInstrumentSearchScopes: Readonly<
  Record<StrategyInstrumentMode, { markets: readonly string[]; instrumentTypes: readonly string[] }>
> = {
  exchange: { markets: ['SH', 'SZ', 'BJ', 'HK', 'US'], instrumentTypes: ['STOCK', 'ETF'] },
  nav: { markets: ['OF'], instrumentTypes: ['MUTUAL_FUND'] },
};

export function strategyInstrumentFromDirectory(
  item: { symbol: string; market: string; instrumentType: string; active: boolean },
  mode: StrategyInstrumentMode,
): StrategyExecutionInstrument | null {
  const scope = strategyInstrumentSearchScopes[mode];
  if (
    !item.active ||
    !item.symbol.trim() ||
    !scope.markets.includes(item.market) ||
    !scope.instrumentTypes.includes(item.instrumentType)
  )
    return null;
  let market: StrategyExecutionInstrument['market'] = 'CN';
  if (item.market === 'HK' || item.market === 'US') market = item.market;
  let assetType: StrategyExecutionInstrument['assetType'] = 'stock';
  if (item.instrumentType === 'ETF') assetType = 'etf';
  else if (item.instrumentType === 'MUTUAL_FUND') assetType = 'fund';
  return { symbol: item.symbol, market, assetType };
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function withStrategyExecutionInstrument(
  definition: Record<string, unknown>,
  instrument: StrategyExecutionInstrument | null,
): Record<string, unknown> {
  const patch = instrument ?? { symbol: '' };
  return {
    ...definition,
    executionInstrument: { ...record(definition.executionInstrument), ...patch },
  };
}
