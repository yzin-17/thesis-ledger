import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { PortfolioTradeView } from '../src/features/portfolio/PortfolioTradeView.js';
import { portfolioTradeKeys } from '../src/features/portfolio/portfolio-trade.queries.js';

const account = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '实际账户',
  type: 'securities' as const,
  mode: 'actual' as const,
  currency: 'CNY' as const,
};

const trade = {
  id: 'trade:trade-projection-v1:11111111-1111-4111-8111-111111111111:AAPL.US:buy-1',
  accountId: account.id,
  accountMode: 'actual' as const,
  symbol: 'AAPL.US',
  lifecycle: 'ENDED' as const,
  exitProgress: 'FULL' as const,
  endEvidence: 'SELL_EXECUTION' as const,
  openedAt: '2026-01-01T00:00:00.000Z',
  closedAt: '2026-01-05T00:00:00.000Z',
  earliestEvidenceAt: '2026-01-01T00:00:00.000Z',
  sourceQuantity: '100',
  closedQuantity: '100',
  remainingQuantity: '0',
  grossRealizedPnl: '200',
  netRealizedPnl: '190',
  realizedNetReturnRate: '0.19',
  costEstimated: false,
  completeness: 'COMPLETE' as const,
  issues: [],
  costIssues: [],
  algorithmVersion: 'trade-projection-v1',
  projectionGeneration: '3',
  excludedReasons: [],
};

describe('Portfolio Trade UI 契约', () => {
  it('展示只读 Trade 列表和进入详情的入口', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(portfolioTradeKeys.list('actual', '', '', 'ALL'), {
      pages: [
        {
          accountId: null,
          mode: 'actual',
          items: [trade],
          nextCursor: null,
          projectionGenerations: { [account.id]: '3' },
        },
      ],
      pageParams: [undefined],
    });

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <PortfolioTradeView mode="actual" accounts={[account]} onReview={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(markup).toContain('Trade Projection');
    expect(markup).toContain('AAPL.US');
    expect(markup).toContain('实际账户');
    expect(markup).toContain('已结束');
    expect(markup).toContain('查看详情');
    expect(markup).not.toContain('编辑 Trade');
  });
});
