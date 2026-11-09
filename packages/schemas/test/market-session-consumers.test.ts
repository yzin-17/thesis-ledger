import { expect, it } from 'vitest';
import { fundValuationSchema } from '../src/fund-valuation.js';
const value = {
  version: 1, symbol: '000001.OF', marketState: 'unknown', quality: 'unavailable',
  estimatedNav: null, changePercent: null, estimatedAt: null, oldestPriceAt: null, anchor: null,
  disclosureCoverage: 0, pricedCoverage: 0, reasons: ['calendar_unavailable'], method: 'disclosed-holdings-qfq-v1',
  marketSession: { state: 'unknown', tradingDayState: 'unknown', evaluatedAt: '2026-11-09T02:00:00Z', reason: 'calendar_unavailable', sessions: [] },
};
it('未知市场合同保留稳定原因与空值，并接受旧的无共享状态响应', () => {
  expect(fundValuationSchema.safeParse(value).success).toBe(true);
  expect(fundValuationSchema.safeParse({ ...value, marketState: 'closed', marketSession: undefined, reasons: ['market_closed'] }).success).toBe(true);
});
it.each([
  { reasons: ['market_closed'] },
  { quality: 'complete', estimatedNav: 1, changePercent: 0 },
  { marketState: 'closed' },
])('拒绝日历未知被解释成休市、可用估值或不一致状态：%j', change => {
  expect(fundValuationSchema.safeParse({ ...value, ...change }).success).toBe(false);
});
