import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { Position, Account } from '../portfolio/portfolio.types.js';

import { PortfolioManagement } from '../portfolio/PortfolioManagement.js';
import { useAccountValuationQuery } from '../portfolio/portfolio.queries.js';
import { ScreenshotImportReview } from './ScreenshotImportReview.js';

const accountTypeLabel = (type: Account['type']) => {
  if (type === 'fund') return '基金';
  if (type === 'cash') return '现金';
  return '证券';
};

export function ImportReview({
  accounts,
  positions,
  cashValue,
  accountsReady = true,
  onPortfolioChanged,
}: {
  accounts: Account[];
  positions: Position[];
  cashValue?: number;
  accountsReady?: boolean;
  onPortfolioChanged: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const queryStep = params.get('step');
  const queryMethod = params.get('method');
  const requestedAccountId = params.get('accountId') ?? '';
  const screenshotQueryRequested =
    params.get('entry') === 'screenshot' ||
    queryMethod === 'screenshot' ||
    queryStep === 'screenshot';
  const [accountId, setAccountId] = useState(() => {
    if (requestedAccountId) return requestedAccountId;
    try {
      return window.sessionStorage.getItem('thesis-ledger-last-account') ?? '';
    } catch {
      return '';
    }
  });
  const [dirty, setDirty] = useState(false);
  const [positionSheetOpen, setPositionSheetOpen] = useState(false);
  const [screenshotSheetOpen, setScreenshotSheetOpen] = useState(() => {
    if (!screenshotQueryRequested) return false;
    const initialAccount =
      accounts.find((account) => account.id === requestedAccountId) ?? accounts[0];
    return Boolean(initialAccount && initialAccount.type !== 'cash');
  });

  useEffect(() => {
    if (requestedAccountId && accounts.some((account) => account.id === requestedAccountId)) {
      setAccountId(requestedAccountId);
      return;
    }
    if (accountId && accounts.some((account) => account.id === accountId)) return;
    if (accounts[0]) {
      setAccountId(accounts[0].id);
      try {
        window.sessionStorage.setItem('thesis-ledger-last-account', accounts[0].id);
      } catch {
        /* storage is optional */
      }
    }
  }, [accountId, accounts, requestedAccountId]);

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const entryValuationQuery = useAccountValuationQuery(
    accountId,
    selectedAccount?.mode,
    Boolean(selectedAccount),
  );
  const entryPositions =
    entryValuationQuery.data?.positions ??
    positions.filter((position) => position.accountId === accountId);
  const entryCashValue = entryValuationQuery.data?.cashValue ?? cashValue ?? 0;
  useEffect(() => {
    if (screenshotQueryRequested && selectedAccount?.type !== 'cash') {
      setScreenshotSheetOpen(true);
    }
  }, [screenshotQueryRequested, selectedAccount?.type]);
  const accountPositions = entryPositions.filter((position) => position.accountId === accountId);
  const confirmDiscard = () => !dirty || window.confirm('当前有未保存修改，切换后会丢弃，继续吗？');

  const setScreenshotEntryUrl = (open: boolean) => {
    const next = new URLSearchParams(location.search);
    next.set('method', open ? 'screenshot' : 'manual');
    next.set('step', open ? 'screenshot' : 'position');
    if (open) next.set('entry', 'screenshot');
    else next.delete('entry');
    if (accountId) next.set('accountId', accountId);
    void navigate({ pathname: '/position-entry', search: '?' + next.toString() });
  };

  const openScreenshotSheet = () => {
    if (selectedAccount?.type === 'cash' || !confirmDiscard()) return;
    setDirty(false);
    setPositionSheetOpen(false);
    setScreenshotSheetOpen(true);
    setScreenshotEntryUrl(true);
  };

  const closeScreenshotSheet = (open: boolean) => {
    if (open) {
      setScreenshotSheetOpen(true);
      return;
    }
    if (!confirmDiscard()) return;
    setDirty(false);
    setScreenshotSheetOpen(false);
    setScreenshotEntryUrl(false);
  };

  const showManualEntry = () => {
    if (screenshotSheetOpen) closeScreenshotSheet(false);
  };

  const selectAccount = (nextAccountId: string) => {
    if (nextAccountId === accountId) return;
    if (!confirmDiscard()) return;
    setDirty(false);
    setPositionSheetOpen(false);
    setScreenshotSheetOpen(false);
    setAccountId(nextAccountId);
    try {
      window.sessionStorage.setItem('thesis-ledger-last-account', nextAccountId);
    } catch {
      /* storage is optional */
    }
    const next = new URLSearchParams(location.search);
    next.set('accountId', nextAccountId);
    next.set('method', 'manual');
    next.set('step', 'position');
    next.delete('entry');
    void navigate({ pathname: '/position-entry', search: '?' + next.toString() });
  };
  if (accounts.length === 0) {
    return (
      <PortfolioManagement
        accounts={accounts}
        positions={[]}
        step="account"
        accountsReady={accountsReady}
        onSaved={onPortfolioChanged}
      />
    );
  }

  const closePositionSheet = (open: boolean) => {
    setPositionSheetOpen(open);
    if (!open) {
      const next = new URLSearchParams(location.search);
      next.delete('entry');
      void navigate({ pathname: '/position-entry', search: '?' + next.toString() });
    }
  };
  return (
    <ImportPositionPage
      accounts={accounts}
      accountId={accountId}
      accountPositions={accountPositions}
      entryCashValue={entryCashValue}
      selectedAccount={selectedAccount}
      screenshotSheetOpen={screenshotSheetOpen}
      positionSheetOpen={positionSheetOpen}
      requestedAccountId={requestedAccountId}
      onNavigateAccounts={() => void navigate('/accounts')}
      onSelectAccount={selectAccount}
      onShowManualEntry={showManualEntry}
      onOpenScreenshot={openScreenshotSheet}
      onClosePositionSheet={closePositionSheet}
      onDirtyChange={setDirty}
      onPortfolioChanged={onPortfolioChanged}
      onCloseScreenshotSheet={closeScreenshotSheet}
    />
  );
}

function ImportPositionPage({
  accounts,
  accountId,
  accountPositions,
  entryCashValue,
  selectedAccount,
  screenshotSheetOpen,
  positionSheetOpen,
  requestedAccountId,
  onNavigateAccounts,
  onSelectAccount,
  onShowManualEntry,
  onOpenScreenshot,
  onClosePositionSheet,
  onDirtyChange,
  onPortfolioChanged,
  onCloseScreenshotSheet,
}: {
  accounts: Account[];
  accountId: string;
  accountPositions: Position[];
  entryCashValue: number;
  selectedAccount: Account | undefined;
  screenshotSheetOpen: boolean;
  positionSheetOpen: boolean;
  requestedAccountId: string;
  onNavigateAccounts: () => void;
  onSelectAccount: (accountId: string) => void;
  onShowManualEntry: () => void;
  onOpenScreenshot: () => void;
  onClosePositionSheet: (open: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onPortfolioChanged: () => void;
  onCloseScreenshotSheet: (open: boolean) => void;
}) {
  return (
    <section
      className="module-page import-page"
      data-import-step="position"
      data-screenshot-sheet-open={String(screenshotSheetOpen)}
    >
      <p className="kicker">Portfolio Input</p>
      <div className="entry-page-heading">
        <div>
          <h1>录入持仓</h1>
          <p className="page-description">更新账户当前持仓与现金余额。</p>
        </div>
        <Button className="text-button" type="button" variant="link" onClick={onNavigateAccounts}>
          账户管理
        </Button>
      </div>
      <div className="entry-context">
        <label>
          当前账户
          <Select
            value={accountId || null}
            onValueChange={(value) => value && onSelectAccount(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择账户">
                {selectedAccount?.name ?? '选择账户'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} · {account.institution || '未填写机构'} · {account.currency} ·{' '}
                    {accountTypeLabel(account.type)} · {account.mode === 'shadow' ? '模拟' : '实际'}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        <div className="entry-account-meta">
          <span>
            {selectedAccount?.institution || '未填写机构'} · {selectedAccount?.currency} ·{' '}
            {selectedAccount?.mode === 'shadow' ? '模拟账户' : '实际账户'}
          </span>
        </div>
      </div>
      {selectedAccount?.type === 'cash' && screenshotSheetOpen && (
        <div className="notice" role="status">
          现金账户只支持手动现金余额。
        </div>
      )}
      <nav className="mt-3 mb-1 flex flex-wrap gap-2 pb-4" aria-label="持仓录入操作">
        <Button
          type="button"
          variant={screenshotSheetOpen ? 'outline' : 'default'}
          className={cn(screenshotSheetOpen && 'secondary')}
          onClick={onShowManualEntry}
        >
          手动录入
        </Button>
        <Button
          type="button"
          disabled
          variant={screenshotSheetOpen ? 'default' : 'outline'}
          className={cn(!screenshotSheetOpen && 'secondary')}
          onClick={onOpenScreenshot}
        >
          截图导入（暂未开放）
        </Button>
      </nav>
      <PortfolioManagement
        accounts={accounts}
        positions={accountPositions}
        cashValue={entryCashValue}
        step="position"
        defaultAccountId={accountId}
        entryAccountLocked={Boolean(requestedAccountId)}
        entrySheetOpen={positionSheetOpen}
        onEntrySheetOpenChange={onClosePositionSheet}
        onDirtyChange={onDirtyChange}
        onSaved={onPortfolioChanged}
      />
      <Sheet open={screenshotSheetOpen} onOpenChange={onCloseScreenshotSheet}>
        <SheetContent
          side="right"
          aria-describedby="screenshot-import-description"
          className="h-[100dvh] w-[620px] max-w-[calc(100%-16px)] gap-0 overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
        >
          <div className="panel-heading">
            <SheetTitle>截图导入</SheetTitle>
            <SheetDescription id="screenshot-import-description">
              上传不会直接修改持仓；请在提交前完成代码、数量和成本价审核。
            </SheetDescription>
          </div>
          <ScreenshotImportReview
            accounts={accounts}
            initialAccountId={accountId}
            accountLocked
            embedded
            onDirtyChange={onDirtyChange}
            onPortfolioChanged={onPortfolioChanged}
          />
        </SheetContent>
      </Sheet>
    </section>
  );
}
