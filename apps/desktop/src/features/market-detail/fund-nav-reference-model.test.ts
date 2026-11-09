import { describe, expect, it } from 'vitest';
import type { FundNavHistory } from '@thesis-ledger/schemas';
import type { MarketDetailPosition } from './market-detail.types.js';
import { fundNavCostReference } from './fund-nav-reference-model.js';

const history: FundNavHistory = [{ version: 3, symbol: '000001.OF', navDate: '2026-11-06T00:00:00Z', unitNav: 1,
  provider: 'fixture', fetchedAt: '2026-11-08T00:00:00Z', freshness: 'delayed' }];
const position: MarketDetailPosition = { symbol: '000001.OF', accountId: 'account-a', mode: 'actual',
  currency: 'CNY', costPrice: 1.2222222222222, quantity: 90, asset: { name: '验证基金', assetType: 'fund' } };

describe('基金持仓成本可比性', () => {
  it('使用原始单位成本，零成本有效，不修改持仓或净值', () => {
    const original = JSON.stringify({ history, position });
    expect(fundNavCostReference(history, position)).toEqual({ price: position.costPrice, reason: null });
    expect(fundNavCostReference(history, { ...position, costPrice: 0 }).price).toBe(0);
    expect(JSON.stringify({ history, position })).toBe(original);
  });
  it('没有持仓上下文、币种不符、代码不符及无效成本各给出具体原因', () => {
    expect(fundNavCostReference(history).reason).toContain('具体账户');
    expect(fundNavCostReference(history, { ...position, symbol: '161725.OF' }).reason).toContain('代码不一致');
    expect(fundNavCostReference(history, { ...position, currency: 'USD' }).reason).toContain('币种');
    expect(fundNavCostReference(history, { ...position, currency: undefined }).reason).toContain('缺少持仓币种');
    expect(fundNavCostReference(history, { ...position, quantity: 0 }).reason).toContain('没有可比较');
    expect(fundNavCostReference(history, { ...position, costPrice: NaN }).reason).toContain('无效');
    expect(fundNavCostReference([], position).reason).toContain('暂无净值');
  });
});
