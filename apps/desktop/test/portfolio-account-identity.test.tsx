import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PortfolioPositionTable } from '../src/features/portfolio/PortfolioOverview.js';
import type { Account, Portfolio } from '../src/features/portfolio/portfolio.types.js';

const accounts: Account[] = [
  { id: 'android', name: '安卓基金账户', type: 'fund', currency: 'CNY', mode: 'actual' },
  { id: 'ios', name: '苹果基金账户', type: 'fund', currency: 'CNY', mode: 'actual' },
];
const portfolio: Portfolio = {
  totalMarketValue: 161.1,
  totalCost: 220,
  totalPnl: -58.9,
  cashValue: 0,
  mode: 'actual',
  partial: false,
  valuedAt: '2026-11-04T08:21:21Z',
  positions: accounts.map((account) => ({
    id: `position-${account.id}`,
    accountId: account.id,
    symbol: '000001.OF',
    quantity: 90,
    costPrice: 1.22,
    marketValue: 80.55,
    pnl: -29.45,
    stale: false,
    asset: { name: '华夏成长混合' },
  })),
};

describe('组合持仓账户归属', () => {
  it('同一标的跨账户保留独立持仓，并显示对应账户及去重标的数量', () => {
    const html = renderToStaticMarkup(
      <PortfolioPositionTable portfolio={portfolio} accounts={accounts} />,
    );
    const rows = html.match(/<tbody>([\s\S]*?)<\/tbody>/)![1]!.match(/<tr[\s\S]*?<\/tr>/g)!;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('>安卓基金账户</td>');
    expect(rows[0]).not.toContain('苹果基金账户');
    expect(rows[1]).toContain('>苹果基金账户</td>');
    expect(rows[1]).not.toContain('安卓基金账户');
    expect(html).toContain('1 个标的 · 2 笔账户持仓');
    expect(rows.every((row) => row.includes('华夏成长混合') && row.includes('80.55'))).toBe(true);
  });

  it('账户信息缺失时保留持仓，以账户编号区分来源', () => {
    const html = renderToStaticMarkup(
      <PortfolioPositionTable portfolio={portfolio} accounts={[]} />,
    );
    expect(html).toContain('账户信息不可用（android）');
    expect(html).toContain('账户信息不可用（ios）');
    expect(html).toContain('1 个标的 · 2 笔账户持仓');
  });
});
