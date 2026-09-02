import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { Sheet } from '../src/components/ui/sheet.js';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { Toaster } from '../src/components/ui/toast.js';
import { AccountDataPage } from '../src/features/account-data/AccountDataPage.js';
import { chargeCategoryLabel } from '../src/features/account-data/account-data.helpers.js';
import { accountDataKeys } from '../src/features/account-data/account-data.queries.js';
import { AccountManagementSection } from '../src/features/portfolio/PortfolioManagementSections.js';
import type { PortfolioManagementViewProps } from '../src/features/portfolio/PortfolioManagementView.types.js';
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
          <ConfirmDialogProvider>
            <AccountDataPage accounts={accounts} onPortfolioChanged={() => undefined} />
          </ConfirmDialogProvider>
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const renderInlineAccountManager = (accountSheetOpen: boolean) => {
  const noop = () => undefined;
  const asyncNoop = async () => undefined;
  const props = {
    accounts: [account],
    positions: [],
    step: 'account',
    accountFormInline: true,
    managedAccounts: [account],
    onAccountEntry: undefined,
    selectedAccount: account,
    entryAccountLocked: false,
    positionSheetOpen: false,
    accountSheetOpen,
    entrySheetMode: 'position',
    entryAccountId: account.id,
    editing: null,
    editingAccount: null,
    busyAction: null,
    instrumentQuery: '',
    instrumentResults: [],
    instrumentSearchState: 'idle',
    instrumentSearchBusy: false,
    instrumentSearchOpen: false,
    selectedInstrument: null,
    manualInstrumentEntry: false,
    manualAssetType: 'stock',
    markDirty: noop,
    confirmDiscard: () => true,
    openEntrySheet: noop,
    toggleAccount: asyncNoop,
    submitAccount: asyncNoop,
    submitPosition: asyncNoop,
    submitCashBalance: asyncNoop,
    clearPositions: asyncNoop,
    remove: asyncNoop,
    confirmInstrument: asyncNoop,
    clearInstrumentSelection: noop,
    startManualInstrumentEntry: noop,
    handleInstrumentQueryChange: noop,
    setAccountSheetOpen: noop,
    setPositionSheetOpen: noop,
    setEditingAccount: noop,
    setEditing: noop,
    setEntryAccountId: noop,
    setEntrySheetMode: noop,
    setSelectedInstrument: noop,
    setInstrumentQuery: noop,
    setInstrumentSearchOpen: noop,
    setManualInstrumentEntry: noop,
    setManualAssetType: noop,
  } as unknown as PortfolioManagementViewProps;

  return renderToStaticMarkup(
    <ConfirmDialogProvider>
      <Sheet open>
        <AccountManagementSection {...props} />
      </Sheet>
    </ConfirmDialogProvider>,
  );
};

describe('账户数据页面契约', () => {
  it('默认进入成交记录，并由账户下拉承载实际/模拟隔离信息', () => {
    const markup = renderPage();
    const pageSource = readFileSync(
      new URL('../src/features/account-data/AccountDataPage.tsx', import.meta.url),
      'utf8',
    );

    expect(markup).toContain('资产录入');
    expect(markup).toContain('持仓');
    expect(markup).toContain('成交记录');
    expect(markup).toContain('现金');
    expect(markup).toContain('录入成交');
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>导入草稿（暂未开放）<\/button>/);
    expect(markup).toContain('实际证券账户 · 测试机构 · CNY · 实际');
    expect(markup).not.toContain('账本模式');
    expect(markup).not.toContain('data-selected-account-id');
    expect(pageSource).toContain("account.mode === 'shadow' ? '模拟' : '实际'");
    expect(markup).toContain('data-active');
    expect(pageSource).toMatch(/const selectAccount[\s\S]*?setCashTransferAction\(null\)/);
    expect(pageSource).toMatch(/const selectTab[\s\S]*?setCashTransferAction\(null\)/);
  });

  it('账户设置在同一个 Drawer 内切换账户列表和账户表单', () => {
    const listMarkup = renderInlineAccountManager(false);
    const formMarkup = renderInlineAccountManager(true);

    expect(listMarkup).not.toContain('data-slot="sheet-content"');
    expect(listMarkup).toContain('data-account-manager-view="list"');
    expect(listMarkup).toContain('账户设置');

    expect(formMarkup).not.toContain('data-slot="sheet-content"');
    expect(formMarkup).toContain('data-account-manager-view="form"');
    expect(formMarkup).toContain('返回账户设置');
    expect(formMarkup).toContain('账户名称');
    expect(formMarkup).toContain('data-slot="sheet-footer"');
  });

  it('账户查询尚未完成时保留加载语义，空账户时引导账户设置', () => {
    const loadingMarkup = renderPage('', [account], false);
    expect(loadingMarkup).toContain('资产录入');
    expect(loadingMarkup).toContain('aria-busy="true"');

    const emptyMarkup = renderPage('', []);
    expect(emptyMarkup).toContain('先创建一个账户');
    expect(emptyMarkup).toContain('账户管理');
    expect(emptyMarkup).toContain('创建账户');
  });

  it('成交表单表达成交字段、未验证规则和稳定写入语义', () => {
    const fullAccountName = '这是一个需要完整显示的长账户名称';
    const markup = renderPage('?entry=execution', [{ ...account, name: fullAccountName }]);
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
    const dateInputSource = readFileSync(
      new URL('../src/components/ui/date-input.tsx', import.meta.url),
      'utf8',
    );

    expect(markup).toContain('录入成交');
    expect(markup).toContain(fullAccountName);
    expect(markup).not.toContain('实际成交');
    expect(accountDataSource).toContain('数量');
    expect(accountDataSource).toContain('价格');
    expect(accountDataSource).toContain('成交币种');
    expect(accountDataSource).toContain('成交时间');
    expect(accountDataSource).toContain('时间精度');
    expect(accountDataSource).toContain('结算时间（可选）');
    expect(dateInputSource).toContain('showPicker');
    expect(dateInputSource).toContain('YYYY-MM-DD');
    expect(dateInputSource).toContain('YYYY-MM-DD HH:mm');
    expect(dateInputSource).toContain('onPointerDown={openDatePicker}');
    expect(dateInputSource).toContain('ref={setInputRef}');
    expect(dateInputSource).toContain('CalendarIcon');
    expect(dateInputSource).toContain('opacity-0');
    expect(dateInputSource).toContain('::-webkit-datetime-edit');
    expect(dateInputSource).toContain('pickerSupported === false');
    expect(executionSource.match(/<DateInput/g)).toHaveLength(2);
    expect(executionSource).not.toContain('DatePickerInput');
    expect(accountDataSource).toContain('费用明细');
    expect(accountDataSource).toContain('交易规则未验证');
    expect(executionSource).toContain('<Alert variant="subtle">');
    expect(accountDataSource).toContain('重复重放不会重复写入');
    expect(accountDataSource).toContain('账本版本已变化');
    expect(executionSource).toContain('if (submitting) return;');
    expect(executionSource).not.toContain('window.confirm');
    expect(executionSource).toContain('skipDiscardConfirm: true');
    expect(accountDataSource).toContain(
      '!options?.skipDiscardConfirm && !(await confirmDiscard())',
    );
    expect(accountDataSource).toContain('原因必填');
    expect(accountDataSource).toContain('确认对账并写入账本');
    expect(accountDataSource).toContain('恢复');
    expect(accountDataSource).toContain('作废');
    expect(executionSource).not.toContain('<div className="grid');
    expect(executionSource).toContain('<FieldGroup className="grid');
    expect(executionSource).toContain('whitespace-normal break-words');
    expect(executionSource).not.toContain('truncate">{account.name}</span>');
    expect(executionSource).not.toContain('实际成交');
    expect(executionSource).toContain('{accountSummary}');
    expect(executionSource).toContain('accountTypeLabel(account.type)');
    expect(executionSource).toContain('证券账户');
    expect(executionSource).toContain('基金账户');
    expect(executionSource).toContain('现金账户');
    expect(executionSource).not.toContain('{category}');
    expect(executionSource).not.toContain('border-t');
    expect(executionSource).toContain('<Separator />');
  });

  it('费用类别下拉使用中文显示名并保留后端枚举映射', () => {
    expect(chargeCategoryLabel('COMMISSION')).toBe('佣金');
    expect(chargeCategoryLabel('TAX')).toBe('税费');
    expect(chargeCategoryLabel('LEVY')).toBe('征费');
    expect(chargeCategoryLabel('EXCHANGE')).toBe('交易所费用');
    expect(chargeCategoryLabel('REGULATORY')).toBe('监管费');
    expect(chargeCategoryLabel('OTHER')).toBe('其他费用');
  });

  it('持仓页签明确是观察检查点，现金页签按币种和结算状态分层', () => {
    const positionMarkup = renderPage('?tab=positions');
    const positionSource = readFileSync(
      new URL('../src/features/portfolio/PortfolioPositionObservation.tsx', import.meta.url),
      'utf8',
    );
    expect(positionMarkup).toContain('持仓观察');
    expect(positionMarkup).toContain('不产生 BUY / SELL 成交记录');
    expect(positionMarkup).toContain('导入持仓快照');
    expect(positionMarkup).toMatch(/<button[^>]*disabled[^>]*>导入持仓快照（暂未开放）<\/button>/);
    expect(positionMarkup).toContain('持仓市值');
    expect(positionMarkup).toContain('观察状态');
    expect(positionMarkup).toContain('校准状态');
    expect(positionMarkup).toContain('已校准');
    expect(positionMarkup).toContain('sticky right-0');
    expect(positionMarkup).toContain('bg-background');
    expect(positionMarkup).toContain('w-40 min-w-40');
    expect(positionMarkup).toContain('flex items-center justify-center gap-1');
    expect(positionMarkup).toContain('h-8');
    expect(positionMarkup).toContain('shadow-none');
    expect(positionMarkup).toContain('重新校准');
    expect(positionMarkup).toContain('取消校准');
    expect(positionMarkup).not.toContain('更多操作：半导体设备ETF国泰');
    expect(positionMarkup).not.toContain('当前结果来自账本投影');
    expect(positionSource).toContain('取消校准');
    expect(positionSource).toContain('清空持仓观察');

    const cashMarkup = renderPage('?tab=cash');
    expect(cashMarkup).toContain('已结算余额');
    expect(cashMarkup).toContain('待结算应收 / 应付');
    expect(cashMarkup).toContain('证据完整度');
    expect(cashMarkup).toContain('校准现金余额');
  });
});
