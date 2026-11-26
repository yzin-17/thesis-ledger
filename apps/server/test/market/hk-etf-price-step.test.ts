import { expect, it } from 'vitest';
import { hkEtfPriceStep } from '../../src/market/market-hk-etf-price-step.js';

it('港股 ETF 按官方目录选择 Part B 或 D，并按候选价格取价位', () => {
  expect(hkEtfPriceStep('02800.HK', '22.5')).toBe('0.02');
  expect(hkEtfPriceStep('02800.HK', '9.99')).toBe('0.005');
  expect(hkEtfPriceStep('02821.HK', '100')).toBe('0.05');
  expect(() => hkEtfPriceStep('02821.HK', '0.49')).toThrow('price_step_unavailable');
  expect(() => hkEtfPriceStep('00000.HK', '10')).toThrow('etf_spread_table_unverified');
});
