import {
  marketReferenceCatalog,
  marketReferenceSymbolMarket,
  type MarketReferenceDataset,
} from './market-reference-catalog.js';
import {
  derivativeReferenceAssets,
  optionUnderlyingCodes,
} from './market-reference-derivative-catalog.js';

export function marketReferenceAssetType(dataset: MarketReferenceDataset) {
  return (
    derivativeReferenceAssets[dataset] ??
    (marketReferenceCatalog[dataset].scope === 'etf' ? 'ETF' : 'STOCK')
  );
}

export function marketReferenceCodeInput(dataset: MarketReferenceDataset) {
  const scope = marketReferenceCatalog[dataset].scope;
  if (scope === 'security') return { label: '证券代码', example: '例如 600519.SH、300750.SZ。' };
  if (scope === 'etf') {
    const example =
      dataset === 'etf-option-contracts'
        ? '支持 510050.SH、510300.SH、588000.SH、510500.SH，读取当前近月。'
        : '例如 510300.SH、159915.SZ。';
    return { label: '证券代码', example };
  }
  if (scope === 'future')
    return {
      label: '期货代码',
      example: '例如 RB0、M0（主力连续），或 RB2612、IF2612（具体合约）。',
    };
  if (scope === 'option')
    return { label: '期权合约代码', example: '输入合约清单中的八位代码，例如 10012440。' };
  return null;
}

export function validMarketReferenceSymbol(dataset: MarketReferenceDataset, symbol: string | null) {
  const scope = marketReferenceCatalog[dataset].scope;
  const patterns: Record<string, RegExp> = {
    security: /^(?:(?:60\d{4}|688\d{3})\.SH|(?:00\d{4}|30\d{4})\.SZ)$/,
    etf: /^(?:5[168]\d{4}\.SH|15\d{4}\.SZ)$/,
    future: /^[A-Z]{1,2}(?:0|\d{2}(?:0[1-9]|1[0-2]))$/,
    option: /^\d{8}$/,
  };
  const pattern = patterns[scope];
  if (!pattern) return symbol === null;
  if (symbol === null || !pattern.test(symbol)) return false;
  if (dataset === 'etf-option-contracts' && !optionUnderlyingCodes.includes(symbol)) return false;
  const market = marketReferenceSymbolMarket(dataset);
  return !market || symbol.endsWith(`.${market}`);
}
