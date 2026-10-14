import { normalizeSymbol } from '@thesis-ledger/domain';
import { type MarketDataBarRouteKeyV3 } from '@thesis-ledger/schemas';

/** 行情读取的市场代码；资产类型由已确认身份或显式请求提供。 */
export function normalizeMarketSymbol(input: string): { symbol: string; code: string; market: string } {
  const value = input.trim().toUpperCase();
  const hk = value.match(/^(?:HK\.?([0-9]{1,5})|([0-9]{1,5})\.HK)$/);
  if (hk) {
    const code = (hk[1] ?? hk[2]!).padStart(5, '0');
    if (Number(code) === 0) throw new Error('港股证券代码无效');
    return { symbol: `${code}.HK`, code, market: 'HK' };
  }
  const us = value.match(/^(\^?[A-Z][A-Z0-9.-]{0,31})\.US$/);
  if (us) {
    const code = us[1]!;
    return { symbol: `${code}.US`, code, market: 'US' };
  }
  return normalizeSymbol(input);
}

export function marketRouteMarket(symbol: string): MarketDataBarRouteKeyV3['market'] {
  const market = normalizeMarketSymbol(symbol).market;
  if (market === 'HK' || market === 'US') return market;
  return 'CN';
}
