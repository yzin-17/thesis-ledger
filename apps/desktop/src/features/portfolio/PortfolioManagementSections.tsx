import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

import { money } from '../shared/display.js';
import { PositionFields } from './PortfolioPositionFields.js';
import type { Account, Position } from './portfolio.types.js';
import type { PortfolioManagementViewProps } from './PortfolioManagementView.types.js';

const accountToggleLabel = (busy: boolean, active: boolean) => {
  if (busy) return active ? '停用中…' : '启用中…';
  return active ? '停用' : '重新启用';
};

const accountTypeLabel = (type: Account['type']) => {
  if (type === 'fund') return '基金';
  if (type === 'cash') return '现金';
  return '证券';
};

const accountSaveLabel = (busy: boolean, editing: boolean) => {
  if (busy) return editing ? '保存中…' : '创建中…';
  return editing ? '保存账户' : '创建账户';
};

const positionSaveLabel = (
  saving: boolean,
  editing: Position | null,
  selectedAccount: Account | undefined,
  calibrationMode: boolean,
) => {
  if (saving) return '保存中…';
  if (calibrationMode) return editing ? '保存持仓观察' : '记录持仓观察';
  if (editing) return '保存修改';
  if (selectedAccount?.type === 'cash') return '保存当前现金';
  return '添加持仓';
};

export function AccountManagementSection(props: PortfolioManagementViewProps) {
  const {
    managedAccounts,
    onAccountEntry,
    busyAction,
    editingAccount,
    accountSheetOpen,
    markDirty,
    setEditingAccount,
    setAccountSheetOpen,
    submitAccount,
    toggleAccount,
  } = props;
  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-4">
        <h2 className="m-0 text-xl font-semibold">已有账户</h2>
        <Button
          type="button"
          variant="default"
          onClick={() => {
            setEditingAccount(null);
            markDirty(false);
            setAccountSheetOpen(true);
          }}
        >
          创建账户
        </Button>
      </div>
      {managedAccounts.length > 0 ? (
        <div className="account-list" aria-label="已有账户">
          {managedAccounts.map((account) => (
            <div key={account.id}>
              <span>
                {account.name}
                <small>
                  {(account.institution || '未填写机构') +
                    ' · ' +
                    (account.mode === 'shadow' ? '模拟' : '实际') +
                    ' · ' +
                    account.currency +
                    (account.active === false ? ' · 已停用' : '')}
                </small>
              </span>
              <div className="form-actions">
                {account.active !== false && onAccountEntry && (
                  <Button
                    className="text-button"
                    size="sm"
                    type="button"
                    variant="link"
                    onClick={() => onAccountEntry(account.id)}
                  >
                    录入持仓
                  </Button>
                )}
                <Button
                  className="text-button"
                  size="sm"
                  type="button"
                  variant="link"
                  onClick={() => {
                    setEditingAccount(account);
                    markDirty(false);
                    setAccountSheetOpen(true);
                  }}
                >
                  编辑
                </Button>
                <Button
                  className={cn('text-button', account.active !== false && 'danger')}
                  size="sm"
                  type="button"
                  variant={account.active === false ? 'outline' : 'destructive'}
                  disabled={busyAction !== null}
                  aria-busy={busyAction === `account-toggle:${account.id}`}
                  onClick={() => void toggleAccount(account)}
                >
                  {busyAction === `account-toggle:${account.id}` && (
                    <LoaderCircle
                      data-icon="inline-start"
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {accountToggleLabel(
                    busyAction === `account-toggle:${account.id}`,
                    account.active !== false,
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state" role="status">
          暂无账户，点击右上角“创建账户”开始。
        </div>
      )}
      <Sheet open={accountSheetOpen} onOpenChange={setAccountSheetOpen}>
        <SheetContent
          side="right"
          aria-describedby="account-form-description"
          className="h-[100dvh] w-[620px] max-w-[calc(100%-16px)] overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
        >
          <div className="panel-heading">
            <SheetTitle>{editingAccount ? '编辑账户' : '创建账户'}</SheetTitle>
            <SheetDescription id="account-form-description">
              账户是持仓的容器；类型、模式和币种在出现 Ledger 事件后锁定。
            </SheetDescription>
          </div>
          <form
            key={editingAccount?.id ?? 'new-account'}
            className="form-card min-h-0 w-full max-w-none content-start overflow-auto"
            onChange={() => markDirty()}
            onSubmit={(event) => void submitAccount(event)}
          >
            <label>
              账户名称
              <Input name="name" required maxLength={80} defaultValue={editingAccount?.name} />
            </label>
            <label>
              机构（可选）
              <Input
                name="institution"
                maxLength={80}
                defaultValue={editingAccount?.institution ?? undefined}
                placeholder="例如：支付宝、某某证券"
              />
            </label>
            <label>
              账户类型
              <Select name="type" defaultValue={editingAccount?.type ?? 'securities'}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string | null) => accountTypeLabel(value as Account['type'])}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="securities">证券（股票 / 交易所 ETF）</SelectItem>
                    <SelectItem value="fund">基金（场外基金）</SelectItem>
                    <SelectItem value="cash">现金</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label>
              账户模式
              <Select name="mode" defaultValue={editingAccount?.mode ?? 'actual'}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string | null) => (value === 'shadow' ? '模拟账户' : '实际账户')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="actual">实际账户</SelectItem>
                    <SelectItem value="shadow">模拟账户</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label>
              <Input value="人民币（CNY）" readOnly aria-label="币种" />
            </label>
            <div className="form-actions">
              <Button type="submit" variant="default" disabled={busyAction !== null}>
                {busyAction === 'account-save' && (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                {accountSaveLabel(busyAction === 'account-save', Boolean(editingAccount))}
              </Button>
              {editingAccount && (
                <Button
                  className="secondary"
                  type="button"
                  variant="outline"
                  onClick={() => setEditingAccount(null)}
                >
                  取消
                </Button>
              )}
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function PositionManagementSection(props: PortfolioManagementViewProps) {
  return (
    <div className="mt-6">
      <PositionOverview {...props} />
      <PositionEntrySheet {...props} />
    </div>
  );
}

function PositionOverview({
  positions,
  selectedAccount,
  busyAction,
  cashValue,
  setEditing,
  openEntrySheet,
  clearPositions,
  setEntryAccountId,
  remove,
  showCash = true,
  calibrationMode = false,
}: PortfolioManagementViewProps) {
  const positionHeading = calibrationMode ? '持仓余额观察' : '持仓';
  const positionDescription = calibrationMode
    ? '这里记录观察检查点，不代表真实成交；成交请在“成交记录”中录入。'
    : undefined;
  const clearLabel = calibrationMode ? '清空持仓观察' : '清空持仓';
  const addLabel = calibrationMode ? '校准持仓余额' : '+ 添加持仓';
  const emptyLabel = calibrationMode
    ? '暂无持仓观察，点击右上角“校准持仓余额”记录检查点。'
    : '暂无持仓，点击右上角“添加持仓”开始。';
  return (
    <>
      {selectedAccount?.type !== 'cash' && (
        <>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="m-0 text-xl font-semibold">{positionHeading}</h2>
              {positionDescription && (
                <p className="m-0 mt-1 text-sm text-muted-foreground">{positionDescription}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {positions.length > 0 && (
                <Button
                  className="text-button danger"
                  size="sm"
                  type="button"
                  variant="destructive"
                  disabled={busyAction !== null}
                  aria-busy={busyAction === 'clear-positions'}
                  onClick={() => void clearPositions()}
                >
                  {busyAction === 'clear-positions' && (
                    <LoaderCircle
                      data-icon="inline-start"
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {busyAction === 'clear-positions' ? '清空中…' : clearLabel}
                </Button>
              )}
              <Button
                className="text-button"
                type="button"
                variant="link"
                onClick={() => {
                  setEditing(null);
                  openEntrySheet('position');
                }}
              >
                {addLabel}
              </Button>
            </div>
          </div>
          {positions.length > 0 ? (
            <div className="mt-2 divide-y border-y border-border" aria-label="持仓操作">
              {positions.map((position) => (
                <div
                  key={position.id}
                  className="grid gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(72px,0.8fr)_minmax(120px,1fr)_minmax(150px,1.4fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <strong className="block truncate text-sm font-medium text-foreground">
                      {position.asset.name || position.symbol}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      {position.symbol} · {position.quantity} · {money.format(position.costPrice)}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {position.marketValue === null ? '—' : money.format(position.marketValue)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {position.pnl === null ? '—' : money.format(position.pnl)}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{calibrationMode ? '观察检查点' : '当前记录'}</Badge>
                    <span className="text-xs text-muted-foreground">
                      来源：{position.source ?? '未知'}
                    </span>
                  </div>
                  <div className="form-actions justify-end">
                    <Button
                      className="text-button"
                      size="sm"
                      type="button"
                      variant="link"
                      onClick={() => {
                        setEditing(position);
                        setEntryAccountId(position.accountId);
                        openEntrySheet('position');
                      }}
                    >
                      {calibrationMode ? '校准' : '编辑'}
                    </Button>
                    <Button
                      className="text-button danger"
                      size="sm"
                      type="button"
                      variant="destructive"
                      disabled={busyAction !== null}
                      aria-busy={busyAction === `remove:${position.id}`}
                      onClick={() => void remove(position)}
                    >
                      {busyAction === `remove:${position.id}` && (
                        <LoaderCircle
                          data-icon="inline-start"
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      {busyAction === `remove:${position.id}`
                        ? '移除中…'
                        : calibrationMode
                          ? '移除校准'
                          : '删除'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" role="status">
              {emptyLabel}
            </div>
          )}
        </>
      )}
      {selectedAccount?.type === 'cash' && !showCash && (
        <div className="mt-6 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
          当前是现金账户，没有持仓余额；请切换到“现金”页签查看已结算和待结算金额。
        </div>
      )}
      {showCash && (
        <div className="mt-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="m-0 text-xl font-semibold">现金余额</h2>
            <Button
              className="text-button"
              size="sm"
              type="button"
              variant="link"
              onClick={() => {
                setEditing(null);
                openEntrySheet('cash');
              }}
            >
              编辑
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4 border-y border-border px-1 py-4">
            <span className="text-sm text-muted-foreground">当前余额</span>
            <strong className="font-mono text-base font-medium text-foreground">
              {money.format(cashValue ?? 0)}
            </strong>
          </div>
        </div>
      )}
    </>
  );
}

const positionSheetTitle = (entrySheetMode: 'position' | 'cash', editing: Position | null) => {
  if (entrySheetMode === 'cash') return '编辑现金余额';
  if (editing) return '编辑持仓';
  return '添加持仓';
};

const positionSheetHeading = (
  entrySheetMode: 'position' | 'cash',
  editing: Position | null,
  calibrationMode: boolean,
) => {
  if (entrySheetMode === 'position' && calibrationMode) {
    if (editing) return '修改持仓观察';
    return '校准持仓余额';
  }
  return positionSheetTitle(entrySheetMode, editing);
};

function PositionEntrySheet(props: PortfolioManagementViewProps) {
  const {
    positionSheetOpen,
    setPositionSheetOpen,
    entrySheetMode,
    editing,
    selectedAccount,
    calibrationMode = false,
  } = props;
  return (
    <Sheet open={positionSheetOpen} onOpenChange={setPositionSheetOpen}>
      <SheetContent
        side="right"
        aria-describedby="position-form-description"
        className="h-[100dvh] w-[620px] max-w-[calc(100%-16px)] overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
      >
        <div className="panel-heading">
          <SheetTitle>{positionSheetHeading(entrySheetMode, editing, calibrationMode)}</SheetTitle>
          <SheetDescription id="position-form-description">
            {calibrationMode
              ? '这会创建持仓观察检查点，不会生成 BUY/SELL 成交；单标的录入属于 PARTIAL 观察。'
              : '录入账户当前实际持仓，用于初始化或校准持仓数据。'}
          </SheetDescription>
        </div>
        {entrySheetMode === 'cash' && selectedAccount?.type !== 'cash' ? (
          <CashBalanceForm {...props} />
        ) : (
          <PositionForm {...props} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function CashBalanceForm({
  cashValue,
  busyAction,
  markDirty,
  submitCashBalance,
}: PortfolioManagementViewProps) {
  return (
    <form
      className="form-card min-h-0 w-full max-w-none content-start overflow-auto"
      onChange={() => markDirty()}
      onSubmit={(event) => void submitCashBalance(event)}
    >
      <h3>现金余额</h3>
      <p className="field-hint">现金单独计入组合总资产，不混入持仓成本和盈亏。</p>
      <label>
        当前现金余额（CNY）
        <Input
          name="cashAmount"
          required
          type="number"
          min="0"
          step="0.01"
          defaultValue={cashValue ?? 0}
        />
      </label>
      <div className="form-actions">
        <Button
          type="submit"
          variant="default"
          disabled={busyAction !== null}
          aria-busy={busyAction === 'cash-save'}
        >
          {busyAction === 'cash-save' && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {busyAction === 'cash-save' ? '保存中…' : '保存当前现金'}
        </Button>
      </div>
    </form>
  );
}

function PositionForm(props: PortfolioManagementViewProps) {
  const {
    accounts,
    cashValue,
    selectedAccount,
    entryAccountLocked,
    entryAccountId,
    editing,
    busyAction,
    instrumentQuery,
    instrumentResults,
    instrumentSearchState,
    instrumentSearchBusy,
    instrumentSearchOpen,
    selectedInstrument,
    manualInstrumentEntry,
    manualAssetType,
    markDirty,
    confirmDiscard,
    setPositionSheetOpen,
    submitPosition,
    setEntryAccountId,
    setSelectedInstrument,
    setInstrumentQuery,
    setInstrumentSearchOpen,
    setManualInstrumentEntry,
    setManualAssetType,
    setEntrySheetMode,
    confirmInstrument,
    clearInstrumentSelection,
    startManualInstrumentEntry,
    handleInstrumentQueryChange,
    calibrationMode = false,
  } = props;
  return (
    <form
      className="form-card min-h-0 w-full max-w-none content-start overflow-auto"
      onChange={() => markDirty()}
      onSubmit={(event) => void submitPosition(event)}
      key={editing?.id ?? 'new'}
    >
      <AccountField
        accounts={accounts}
        entryAccountLocked={entryAccountLocked}
        entryAccountId={entryAccountId}
        selectedAccount={selectedAccount}
        confirmDiscard={confirmDiscard}
        markDirty={markDirty}
        setEntryAccountId={setEntryAccountId}
        setSelectedInstrument={setSelectedInstrument}
        setInstrumentQuery={setInstrumentQuery}
        setInstrumentSearchOpen={setInstrumentSearchOpen}
        setManualInstrumentEntry={setManualInstrumentEntry}
        setManualAssetType={setManualAssetType}
        setEntrySheetMode={setEntrySheetMode}
      />
      {selectedAccount?.type === 'cash' ? (
        <label>
          当前现金余额（CNY）
          <Input
            name="cashAmount"
            required
            type="number"
            min="0"
            step="0.01"
            defaultValue={cashValue ?? 0}
          />
        </label>
      ) : (
        <PositionFields
          editing={editing}
          instrumentQuery={instrumentQuery}
          instrumentResults={instrumentResults}
          instrumentSearchState={instrumentSearchState}
          instrumentSearchBusy={instrumentSearchBusy}
          instrumentSearchOpen={instrumentSearchOpen}
          selectedInstrument={selectedInstrument}
          manualInstrumentEntry={manualInstrumentEntry}
          manualAssetType={manualAssetType}
          setInstrumentSearchOpen={setInstrumentSearchOpen}
          handleInstrumentQueryChange={handleInstrumentQueryChange}
          confirmInstrument={confirmInstrument}
          clearInstrumentSelection={clearInstrumentSelection}
          startManualInstrumentEntry={startManualInstrumentEntry}
          setManualAssetType={setManualAssetType}
        />
      )}
      <div className="form-actions justify-end border-t border-border pt-4">
        <Button
          className="secondary"
          type="button"
          variant="outline"
          onClick={() => setPositionSheetOpen(false)}
        >
          取消
        </Button>
        <Button
          type="submit"
          variant="default"
          disabled={busyAction !== null}
          aria-busy={busyAction === 'position-save' || busyAction === 'cash-save'}
        >
          {(busyAction === 'position-save' || busyAction === 'cash-save') && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {positionSaveLabel(
            busyAction === 'position-save' || busyAction === 'cash-save',
            editing,
            selectedAccount,
            calibrationMode,
          )}
        </Button>
      </div>
    </form>
  );
}

function AccountField({
  accounts,
  entryAccountLocked,
  entryAccountId,
  selectedAccount,
  confirmDiscard,
  markDirty,
  setEntryAccountId,
  setSelectedInstrument,
  setInstrumentQuery,
  setInstrumentSearchOpen,
  setManualInstrumentEntry,
  setManualAssetType,
  setEntrySheetMode,
}: Pick<
  PortfolioManagementViewProps,
  | 'accounts'
  | 'entryAccountLocked'
  | 'entryAccountId'
  | 'selectedAccount'
  | 'confirmDiscard'
  | 'markDirty'
  | 'setEntryAccountId'
  | 'setSelectedInstrument'
  | 'setInstrumentQuery'
  | 'setInstrumentSearchOpen'
  | 'setManualInstrumentEntry'
  | 'setManualAssetType'
  | 'setEntrySheetMode'
>) {
  if (entryAccountLocked) {
    return (
      <div className="grid gap-1.5">
        <span className="text-xs text-muted-foreground">账户</span>
        <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
          <strong className="truncate text-sm font-medium text-foreground">
            {selectedAccount?.name ?? '未选择账户'}
          </strong>
          {selectedAccount && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {accountTypeLabel(selectedAccount.type)}账户
            </span>
          )}
        </div>
        <input type="hidden" name="accountId" value={entryAccountId} />
      </div>
    );
  }
  return (
    <label>
      账户
      <Select
        name="accountId"
        required
        value={entryAccountId || null}
        onValueChange={(value) => {
          if (!value || !confirmDiscard()) return;
          const nextAccount = accounts.find((account) => account.id === value);
          markDirty(false);
          setEntryAccountId(value);
          setSelectedInstrument(null);
          setInstrumentQuery('');
          setInstrumentSearchOpen(false);
          setManualInstrumentEntry(false);
          setManualAssetType(nextAccount?.type === 'fund' ? 'fund' : 'stock');
          setEntrySheetMode(nextAccount?.type === 'cash' ? 'cash' : 'position');
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="选择账户">{selectedAccount?.name ?? '选择账户'}</SelectValue>
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
  );
}
