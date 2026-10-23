import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PortfolioDashboard } from '../src/features/portfolio/PortfolioDashboard.js';
import {
  portfolioKeys,
  usePortfolioShellQueries,
} from '../src/features/portfolio/portfolio.queries.js';
import type { Account, Portfolio } from '../src/features/portfolio/portfolio.types.js';

const account: Account = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '收益验收账户',
  type: 'securities',
  mode: 'actual',
  currency: 'CNY',
};
const emptyPortfolio: Portfolio = {
  positions: [],
  totalMarketValue: 0,
  totalCost: 0,
  totalPnl: 0,
  unrealizedPnl: 0,
  unrealizedPnlRatio: null,
  realizedPnl: 0,
  realizedPnlRatio: null,
  cumulativePnl: 0,
  cumulativePnlRatio: null,
  cashValue: 0,
  mode: 'actual',
  partial: false,
  valuedAt: '2026-10-16T16:00:00.000Z',
};
function renderDashboard(portfolio: Portfolio, accounts: Account[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(portfolioKeys.valuation('actual'), portfolio);
  queryClient.setQueryData(portfolioKeys.accounts(), accounts);
  function Dashboard() {
    const query = usePortfolioShellQueries('actual', { enableValuation: true });
    return (
      <PortfolioDashboard
        {...query}
        mode="actual"
        onRetry={vi.fn()}
        onNavigate={vi.fn()}
        onOpenReview={vi.fn()}
      />
    );
  }
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>,
  );
  queryClient.clear();
  return html;
}

describe('无证券持仓的组合仍保留已有业务', () => {
  it('全部卖出后继续显示现金、已实现收益和交易入口', () => {
    const html = renderDashboard(
      {
        ...emptyPortfolio,
        totalMarketValue: 10115,
        cashValue: 10115,
        realizedPnl: 115,
        realizedPnlRatio: 115 / 802,
        cumulativePnl: 115,
        cumulativePnlRatio: 115 / 802,
      },
      [account],
    );
    expect(html).toContain('10,115.00');
    expect(html).toContain('+¥115.00');
    expect(html).toContain('来自已卖出交易');
    expect(html).toContain('role="tab"');
    expect(html).not.toContain('从第一笔持仓开始');
  });
  it('仅现金且尚无卖出仍显示真实零收益', () => {
    const html = renderDashboard({ ...emptyPortfolio, cashValue: 10000, totalMarketValue: 10000 }, [
      account,
    ]);
    expect(html).toContain('10,000.00');
    expect(html).toContain('已实现盈亏');
    expect(html).not.toContain('从第一笔持仓开始');
  });
  it('清仓后成本或 FX 未确认时保留不可用收益而非首次使用空态', () => {
    const html = renderDashboard(
      { ...emptyPortfolio, realizedPnl: null, cumulativePnl: null, partial: true },
      [account],
    );
    expect(html).toContain('已实现盈亏');
    expect(html).not.toContain('从第一笔持仓开始');
  });
  it('只有另一模式账户时仍显示当前模式首次使用引导', () => {
    const html = renderDashboard(emptyPortfolio, [{ ...account, mode: 'shadow' }]);
    expect(html).toContain('从第一笔持仓开始');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).not.toContain('已实现盈亏');
  });
});
