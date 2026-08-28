export type AssetType = 'stock' | 'etf' | 'fund';

export function inferAssetType(symbol: string, requested?: string): AssetType;
export function inferAssetType(symbol?: string, requested?: string): AssetType | undefined;
export function inferAssetType(symbol?: string, requested?: string): AssetType | undefined {
  if (requested) return requested as AssetType;
  if (!symbol) return undefined;
  if (symbol.endsWith('.OF')) return 'fund';
  return /^[15]\d{5}\.(SH|SZ|BJ)$/.test(symbol) ? 'etf' : 'stock';
}
