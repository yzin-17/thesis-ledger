import { describe, expect, it } from 'vitest';
import { marketQuoteSymbolSchema, quoteAssetTypeSchema, quoteSchema } from '../src/index.js';

describe('中港美报价身份合同', () => {
  it.each(['600519.SH', '00700.HK', 'SPY.US', 'BRK.B.US', '^GSPC.US'])('支持规范代码 %s 的报价', (symbol) => {
    expect(quoteSchema.safeParse({ version: 3, symbol, open: 10, high: 12, low: 9,
      price: 11, previousClose: 10, volume: null, amount: 0, stale: false,
      provider: 'futu', marketTime: null, fetchedAt: '2026-10-08T00:00:00Z', freshness: 'unknown' }).success).toBe(true);
  });
  it.each(['00000.HK', '700.HK', 'HK.00700', 'SPY', 'AAPL.JP', '00700', 'SPY.us'])('拒绝非规范代码 %s', (symbol) => {
    expect(marketQuoteSymbolSchema.safeParse(symbol).success).toBe(false);
  });
  it('报价类型保持闭合，不能将其他资产假装股票', () => {
    expect(quoteAssetTypeSchema.safeParse('ETF').success).toBe(true);
    expect(quoteAssetTypeSchema.safeParse('OPTION').success).toBe(false);
  });
});
