import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { PortfolioTradeView } from '../src/features/portfolio/PortfolioTradeView.js';
import { PortfolioTradeDetailTabs } from '../src/features/portfolio/PortfolioTradeDetailSections.js';
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
  assetName: '苹果公司',
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
  projectionFingerprint: null,
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

    expect(markup).toContain('只读查看统一交易投影');
    expect(markup).toContain('苹果公司');
    expect(markup).toContain('AAPL.US');
    expect(markup).toContain('实际账户');
    expect(markup).toContain('已结束');
    expect(markup).toContain('查看详情');
    expect(markup).toContain('已加载');
    expect(markup).toContain('清除筛选');
    expect(markup).not.toContain(trade.id);
    expect(markup).not.toContain('编辑 Trade');
  });

  it('详情使用中文分组并把内部代码收进技术信息', () => {
    const markup = renderToStaticMarkup(
      <PortfolioTradeDetailTabs
        detail={{
          ...trade,
          excludedReasons: ['LIFECYCLE_ACTIVE'],
          issues: ['MISSING_OPENING_BOUNDARY'],
          entryLegs: [],
          baselineComponents: [],
          corporateActions: [],
          closeSlices: [],
          dividendAttributions: [],
          evidenceSources: [],
        }}
        accountLabel="实际账户"
        onReview={vi.fn()}
      />,
    );

    expect(markup).toContain('交易概览');
    expect(markup).toContain('持仓构成');
    expect(markup).toContain('证据与技术信息');
    expect(markup).toContain('交易仍在进行');
    expect(markup).toContain('缺少明确的建仓起点');
    expect(markup).toContain('技术信息');
    expect(markup).not.toContain('Entry Legs');
    expect(markup).not.toContain('Close Slices');
  });
});
