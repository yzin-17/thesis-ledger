import { describe, expect, it } from 'vitest';
import { normalizeMarketSymbol } from '../../src/market/market-symbol-identity.js';

describe('行情市场标的代码', () => {
  it.each(['700.HK', 'HK00700', 'HK.00700'])('港股 %s 绑定相同规范身份', (input) => {
    expect(normalizeMarketSymbol(input)).toEqual({ symbol: '00700.HK', code: '00700', market: 'HK' });
  });
  it.each(['AAPL.US', 'BRK.B.US', '^GSPC.US'])('保留美股代码 %s 的市场与类别符号', (symbol) => {
    expect(normalizeMarketSymbol(symbol)).toEqual({ symbol, code: symbol.slice(0, -3), market: 'US' });
  });
  it('保持内地旧代码与市场推断', () => {
    expect(normalizeMarketSymbol('SH600519')).toMatchObject({ symbol: '600519.SH', market: 'SH' });
  });
  it.each(['00000.HK', '000700.HK', 'AAPL', '00700', 'AAPL.JP'])('拒绝未知或无效市场代码 %s', (symbol) => {
    expect(() => normalizeMarketSymbol(symbol)).toThrow();
  });
});
