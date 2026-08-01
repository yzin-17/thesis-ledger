import type { AssetType, Market } from './models.js';

const SYMBOL_PATTERN = /^(\d{6})\.(SH|SZ|BJ)$/;

export class SymbolNormalizationError extends Error {}

export interface NormalizedSymbol {
  symbol: string;
  code: string;
  market: Market;
  assetType: AssetType;
}

const inferMarket = (code: string): Market => {
  if (/^(5|6|9)/.test(code)) return 'SH';
  if (/^(0|1|2|3)/.test(code)) return 'SZ';
  if (/^(4|8)/.test(code)) return 'BJ';
  throw new SymbolNormalizationError(`无法从代码推断市场: ${code}`);
};

const inferAssetType = (code: string): AssetType => {
  if (/^(1|5)/.test(code)) return 'etf';
  return 'stock';
};

export const normalizeSymbol = (input: string): NormalizedSymbol => {
  const raw = input.trim().toUpperCase();
  const shorthand = raw.match(/^(SH|SZ|BJ)?(\d{6})$/);
  const canonical = raw.match(SYMBOL_PATTERN);
  const code = canonical?.[1] ?? shorthand?.[2];
  const market = (canonical?.[2] ?? shorthand?.[1] ?? (code ? inferMarket(code) : undefined)) as
    Market | undefined;
  if (!code || !market) throw new SymbolNormalizationError(`非法证券代码: ${input}`);
  return { symbol: `${code}.${market}`, code, market, assetType: inferAssetType(code) };
};
