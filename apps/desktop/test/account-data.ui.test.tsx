import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { Toaster } from '../src/components/ui/toast.js';
import { AccountDataPage } from '../src/features/account-data/AccountDataPage.js';
import { accountDataKeys } from '../src/features/account-data/account-data.queries.js';
import { portfolioKeys } from '../src/features/portfolio/portfolio.queries.js';

const account = {
  id: 'account-1',
  name: '实际证券账户',
  institution: '测试机构',
  type: 'securities' as const,
  mode: 'actual' as const,
  currency: 'CNY' as const,
};

const shadowAccount = {
  ...account,
  id: 'account-2',
  name: '模拟证券账户',
  mode: 'shadow' as const,
};

const seedAccountData = (queryClient: QueryClient) => {
  const valuation = {
    totalMarketValue: 1000,
    totalCost: 900,
    totalPnl: 100,
    cashValue: 100,
    mode: 'actual' as const,
    partial: false,
    valuedAt: '2026-08-28T00:00:00.000Z',
    positions: [
      {
        id: 'position-1',
        accountId: account.id,
        symbol: '600000.SH',
        quantity: 10,
        costPrice: 90,
        marketValue: 1000,
        pnl: 100,
        stale: false,
        asset: { name: '测试标的', assetType: 'stock' as const },
        currency: 'CNY' as const,
      },
    ],
    baseCurrency: 'CNY' as const,
    cashByCurrency: [{ currency: 'CNY' as const, amount: 100, convertedAmount: 100 }],
  };
  queryClient.setQueryData(portfolioKeys.valuation('actual', account.id), valuation);
  const events = {
    accountId: account.id,
    ledgerRevision: '7',
    projectionGeneration: '1',
    events: [],
    effective: true,
  };
  for (const filter of ['executions', 'other', 'all'] as const) {
    queryClient.setQueryData(accountDataKeys.events(account.id, 'actual', filter), events);
  }
};

const renderPage = (search = '', accounts = [account, shadowAccount], seed = true) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) seedAccountData(queryClient);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/accounts${search}`]}>
        <Toaster>
          <AccountDataPage accounts={accounts} onPortfolioChanged={() => undefined} />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('账户数据页面契约', () => {
  it('默认进入成交记录，并展示三个平级页签和实际/模拟隔离', () => {
    const markup = renderPage();

    expect(markup).toContain('账户数据');
    expect(markup).toContain('持仓');
    expect(markup).toContain('成交记录');
    expect(markup).toContain('现金');
    expect(markup).toContain('录入成交');
    expect(markup).toContain('实际账户');
    expect(markup).toContain('模拟账户');
    expect(markup).toContain('data-active');
  });

  it('账户查询尚未完成时保留加载语义，空账户时引导账户设置', () => {
    const loadingMarkup = renderPage('', [account], false);
    expect(loadingMarkup).toContain('账户数据');
    expect(loadingMarkup).toContain('aria-busy="true"');

    const emptyMarkup = renderPage('', []);
    expect(emptyMarkup).toContain('先创建一个账户');
    expect(emptyMarkup).toContain('账户管理');
    expect(emptyMarkup).toContain('创建账户');
  });

  it('成交表单表达成交字段、未验证规则和稳定写入语义', () => {
    const markup = renderPage('?entry=execution');
    const accountDataSource = [
      'AccountDataPage.tsx',
      'AccountDataExecutionSheet.tsx',
      'AccountDataAuditSheets.tsx',
      'AccountDataReconciliationSheet.tsx',
    ]
      .map((fileName) =>
        readFileSync(new URL(`../src/features/account-data/${fileName}`, import.meta.url), 'utf8'),
      )
      .join('\n');
    const executionSource = readFileSync(
      new URL('../src/features/account-data/AccountDataExecutionSheet.tsx', import.meta.url),
      'utf8',
    );

    expect(markup).toContain('录入成交');
    expect(accountDataSource).toContain('数量');
    expect(accountDataSource).toContain('价格');
    expect(accountDataSource).toContain('成交币种');
    expect(accountDataSource).toContain('成交时间');
    expect(accountDataSource).toContain('时间精度');
    expect(accountDataSource).toContain('结算时间（可选）');
    expect(accountDataSource).toContain('费用明细');
    expect(accountDataSource).toContain('交易规则未验证');
    expect(accountDataSource).toContain('重复重放不会重复写入');
    expect(accountDataSource).toContain('账本版本已变化');
    expect(accountDataSource).toContain('原因必填');
    expect(accountDataSource).toContain('确认对账并写入账本');
    expect(accountDataSource).toContain('恢复');
    expect(accountDataSource).toContain('作废');
    expect(executionSource).not.toContain('<div className="grid');
    expect(executionSource).toContain('<FieldGroup className="grid');
    expect(executionSource).not.toContain('border-t');
    expect(executionSource).toContain('<Separator />');
  });

  it('持仓页签明确是观察检查点，现金页签按币种和结算状态分层', () => {
    const positionMarkup = renderPage('?tab=positions');
    expect(positionMarkup).toContain('持仓余额观察');
    expect(positionMarkup).toContain('不代表真实成交');
    expect(positionMarkup).toContain('导入持仓快照');

    const cashMarkup = renderPage('?tab=cash');
    expect(cashMarkup).toContain('已结算余额');
    expect(cashMarkup).toContain('待结算应收 / 应付');
    expect(cashMarkup).toContain('证据完整度');
    expect(cashMarkup).toContain('校准现金余额');
  });
});
