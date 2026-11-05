import { expect, it } from 'vitest';
import { portfolioPositionResponseSchema } from '../src/api.js';
const position = { id: '00000000-0000-4000-8000-000000000001', accountId: '00000000-0000-4000-8000-000000000002', symbol: '000001.OF', quantity: 90, costPrice: 1.22, marketPrice: null, marketValue: null, costValue: 109.8, pnl: null, pnlRatio: null, stale: false };
it('读取契约保留未估值原因与净值日期，拒绝未知状态', () => {
  expect(portfolioPositionResponseSchema.parse({ ...position, availabilityReason: 'not_selected' }).availabilityReason).toBe('not_selected');
  expect(portfolioPositionResponseSchema.parse({ ...position, navDate: '2026-11-03T00:00:00+00:00' }).navDate).toBe('2026-11-03T00:00:00+00:00');
  expect(portfolioPositionResponseSchema.safeParse({ ...position, availabilityReason: 'made-up' }).success).toBe(false);
});
