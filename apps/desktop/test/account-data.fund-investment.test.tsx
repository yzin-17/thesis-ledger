import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Toaster } from '../src/components/ui/toast.js';
import { RecurringFundInvestments } from '../src/features/account-data/AccountDataRecurringFundInvestments.js';
import { fundInvestmentKeys } from '../src/features/account-data/account-data.fund-investment.queries.js';

const fundAccount = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '基金账户',
  type: 'fund' as const,
  mode: 'actual' as const,
  currency: 'CNY' as const,
  active: true,
};

const renderFeature = (account = fundAccount) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(fundInvestmentKeys.plans(account.id), []);
  queryClient.setQueryData(fundInvestmentKeys.occurrences(account.id), []);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Toaster>
        <RecurringFundInvestments account={account} />
      </Toaster>
    </QueryClientProvider>,
  );
};

describe('成交记录基金定投', () => {
  it('真实基金账户显示定投入口和待确认语义', () => {
    const markup = renderFeature();
    expect(markup).toContain('基金定投');
    expect(markup).toContain('新建定投');
    expect(markup).toContain('待确认成交');
    expect(markup).toContain('确认前不会改变持仓或现金');
  });

  it('证券账户不显示基金定投', () => {
    const markup = renderFeature({ ...fundAccount, type: 'securities' as const });
    expect(markup).not.toContain('基金定投');
  });
});
