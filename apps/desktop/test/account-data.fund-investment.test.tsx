import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Toaster } from '../src/components/ui/toast.js';
import { RecurringFundInvestments } from '../src/features/account-data/AccountDataRecurringFundInvestments.js';
import { fundInvestmentKeys } from '../src/features/account-data/account-data.fund-investment.queries.js';
import type { Account } from '../src/features/portfolio/portfolio.types.js';

const fundAccount = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '基金账户',
  type: 'fund' as const,
  mode: 'actual' as const,
  currency: 'CNY' as const,
  active: true,
};

const renderFeature = (account: Account = fundAccount, focusOccurrenceId: string | null = null) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(fundInvestmentKeys.plans(account.id), []);
  queryClient.setQueryData(fundInvestmentKeys.occurrences(account.id), []);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Toaster>
        <RecurringFundInvestments account={account} focusOccurrenceId={focusOccurrenceId} />
      </Toaster>
    </QueryClientProvider>,
  );
};

describe('账户定投计划', () => {
  it('当前范围已返回但找不到指定成交时显示关联缺失，不伪造对应计划', () => {
    const markup = renderFeature(fundAccount, 'missing-controlled-occurrence');
    expect(markup).toContain('无法定位对应计划');
    expect(markup).toContain('当前账户未返回这笔成交对应的定投记录或计划');
  });
  it('真实基金账户显示定投入口和待确认语义', () => {
    const markup = renderFeature();
    expect(markup).toContain('定投计划');
    expect(markup).toContain('新建定投');
    expect(markup).toContain('暂无待确认成交');
    expect(markup).toContain('确认前不会改变持仓或现金');
  });

  it.each([
    { type: 'securities' as const },
    { type: 'cash' as const },
    { mode: 'shadow' as const },
    { active: false },
  ])('账户范围 %j 不显示基金定投', (scope) => {
    const markup = renderFeature({ ...fundAccount, ...scope });
    expect(markup).toBe('');
  });
});
