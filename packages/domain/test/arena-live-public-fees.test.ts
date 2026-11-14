import { expect, it } from 'vitest';
import { arenaPublicFees, type ArenaPublicCharge } from '../src/arena-live-public-fees.js';
import { arenaOrderFee } from '../src/arena-live-order-price.js';
import { DecimalValue as D } from '../src/decimal.js';
import type { ArenaPaperQuote } from '../src/arena-live-types.js';
const taf: ArenaPublicCharge = { code: 'tradingActivityFee', side: 'sell', basis: 'actualShares', currency: 'USD',
  rate: '0.000166', maximumAmount: '8.30', lowPriceExemption: 'belowPerShareRate' };

it('实际股数收费遵守封顶、低价豁免及买卖方向，不能按成交额代算', () => {
  expect(arenaPublicFees([taf], 'sell', 'USD', '1000', '20')).toBe('0.17');
  expect(arenaPublicFees([taf], 'sell', 'USD', '1000000', '20')).toBe('8.3');
  expect(arenaPublicFees([taf], 'sell', 'USD', '1000', '0.0001')).toBe('0');
  expect(arenaPublicFees([taf], 'buy', 'USD', '1000', '20')).toBe('0');
  expect(() => arenaPublicFees([taf], 'sell', 'USD', '0.5', '20')).toThrow();
});
it('港股印花税按整港元进位，其他收费独立计算；原始数量和成交价保持精度', () => {
  const charges: ArenaPublicCharge[] = [{ code: 'stampDuty', side: 'both', basis: 'turnover', currency: 'HKD', rate: '0.001', amountRounding: { mode: 'ceil', decimalPlaces: 0 } },
    { code: 'afrcLevy', side: 'both', basis: 'turnover', currency: 'HKD', rate: '0.0000015' }];
  expect(arenaPublicFees(charges, 'buy', 'HKD', '100', '10.000000000001')).toBe('2');
  expect(() => arenaPublicFees(charges, 'buy', 'USD', '100', '10')).toThrow('fee_scope_mismatch');
});
it('委托费用适配同时取得真实股数、成交价与十进制成交额', () => {
  let observed: string[] = [];
  const q = { statutorySellFee: (...args: string[]) => { observed = args; return '0.17'; } } as ArenaPaperQuote;
  const total = arenaOrderFee(q, 'sell', D.from('1000'), D.from('20'), { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 });
  expect(observed).toEqual(['20000', '1000', '20']); expect(total.toString()).toBe('0.17');
});
