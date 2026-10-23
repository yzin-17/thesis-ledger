import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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

import { money } from '../shared/display.js';
import { PositionFields } from './PortfolioPositionFields.js';
import {
  PositionObservationContent,
  PositionOverviewMenu,
  StandardPositionContent,
} from './PortfolioPositionObservation.js';
import {
  accountDisplayLabel,
  accountTypeLabel,
  type Account,
  type Position,
} from './portfolio.types.js';
import type { PortfolioManagementViewProps } from './PortfolioManagementView.types.js';

const positionSaveLabel = (
  saving: boolean,
  editing: Position | null,
  selectedAccount: Account | undefined,
  calibrationMode: boolean,
) => {
  if (saving) return '保存中…';
  if (calibrationMode) return editing ? '保存持仓快照' : '记录持仓快照';
  if (editing) return '保存修改';
  if (selectedAccount?.type === 'cash') return '保存当前现金';
  return '添加持仓';
};

export function PositionManagementSection(props: PortfolioManagementViewProps) {
  const { embedded = false } = props;
  return (
    <div className={cn(!embedded && 'mt-6')}>
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
  resolveInstrumentName,
  setEditing,
  openEntrySheet,
  clearPositions,
  setEntryAccountId,
  remove,
  showCash = true,
  calibrationMode = false,
  onOpenImport,
  onOpenReconciliation,
}: PortfolioManagementViewProps) {
  const positionHeading = calibrationMode ? '持仓快照' : '持仓';
  const positionDescription = calibrationMode
    ? '用于记录持仓快照，不产生 BUY / SELL 成交记录。'
    : undefined;
  const editPosition = (position: Position) => {
    setEditing(position);
    setEntryAccountId(position.accountId);
    openEntrySheet('position');
  };
  const createPosition = () => {
    setEditing(null);
    openEntrySheet('position');
  };
  const positionActions = calibrationMode ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button type="button" onClick={createPosition}>
        记录持仓快照
      </Button>
      <PositionOverviewMenu
        positions={positions}
        busyAction={busyAction}
        clearPositions={clearPositions}
        {...(onOpenImport ? { onOpenImport } : {})}
        {...(onOpenReconciliation ? { onOpenReconciliation } : {})}
      />
    </div>
  ) : (
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
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {busyAction === 'clear-positions' ? '清空中…' : '清空持仓'}
        </Button>
      )}
      <Button className="text-button" type="button" variant="link" onClick={createPosition}>
        + 添加持仓
      </Button>
    </div>
  );

  return (
    <>
      {selectedAccount?.type !== 'cash' && (
        <section className="flex flex-col gap-4" aria-labelledby="portfolio-position-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 id="portfolio-position-title" className="m-0 text-xl font-semibold">
                {positionHeading}
              </h2>
              {positionDescription && (
                <p className="m-0 mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {positionDescription}
                </p>
              )}
            </div>
            {positionActions}
          </div>
          {calibrationMode ? (
            <PositionObservationContent
              positions={positions}
              busyAction={busyAction}
              onCreate={createPosition}
              onEdit={editPosition}
              remove={remove}
              {...(resolveInstrumentName ? { resolveInstrumentName } : {})}
            />
          ) : (
            <StandardPositionContent
              positions={positions}
              busyAction={busyAction}
              onEdit={editPosition}
              remove={remove}
              {...(resolveInstrumentName ? { resolveInstrumentName } : {})}
            />
          )}
        </section>
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
    if (editing) return '修改持仓快照';
    return '记录持仓快照';
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
        size="form"
        className="h-[100dvh] min-h-0 overflow-hidden p-6"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6">
          <SheetHeader>
            <SheetTitle>
              {positionSheetHeading(entrySheetMode, editing, calibrationMode)}
            </SheetTitle>
            <SheetDescription id="position-form-description">
              {calibrationMode
                ? '这会记录持仓快照，不会生成 BUY/SELL 成交；单标的录入属于 PARTIAL 观察。'
                : '录入账户当前实际持仓，用于初始化或核对持仓数据。'}
            </SheetDescription>
          </SheetHeader>
          {entrySheetMode === 'cash' && selectedAccount?.type !== 'cash' ? (
            <CashBalanceForm {...props} />
          ) : (
            <PositionForm {...props} />
          )}
        </div>
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
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-6"
      onChange={() => markDirty()}
      onSubmit={(event) => void submitCashBalance(event)}
    >
      <div className="grid -mx-1 -my-1 min-h-0 max-w-none flex-1 content-start gap-6 overflow-y-auto px-1 py-1">
        <h3>现金余额</h3>
        <p className="field-hint">现金单独计入组合总资产，不混入持仓成本和盈亏。</p>
        <div className="grid gap-1.5 text-xs text-muted-foreground">
          <span>当前现金余额（CNY）</span>
          <Input
            aria-label="当前现金余额（CNY）"
            name="cashAmount"
            required
            type="number"
            min="0"
            step="0.01"
            defaultValue={cashValue ?? 0}
          />
        </div>
      </div>
      <SheetFooter>
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
      </SheetFooter>
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
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-6"
      onChange={() => markDirty()}
      onSubmit={(event) => void submitPosition(event)}
      key={editing?.id ?? 'new'}
    >
      <div className="grid -mx-1 -my-1 min-h-0 max-w-none flex-1 content-start gap-6 overflow-y-auto px-1 py-1">
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
          <div className="grid gap-1.5 text-xs text-muted-foreground">
            <span>当前现金余额（CNY）</span>
            <Input
              aria-label="当前现金余额（CNY）"
              name="cashAmount"
              required
              type="number"
              min="0"
              step="0.01"
              defaultValue={cashValue ?? 0}
            />
          </div>
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
      </div>
      <SheetFooter>
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
      </SheetFooter>
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
  const handleAccountChange = async (value: string | null) => {
    if (!value || !(await confirmDiscard())) return;
    const nextAccount = accounts.find((account) => account.id === value);
    markDirty(false);
    setEntryAccountId(value);
    setSelectedInstrument(null);
    setInstrumentQuery('');
    setInstrumentSearchOpen(false);
    setManualInstrumentEntry(false);
    setManualAssetType(nextAccount?.type === 'fund' ? 'fund' : 'stock');
    setEntrySheetMode(nextAccount?.type === 'cash' ? 'cash' : 'position');
  };

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
    <div className="grid gap-1.5 text-xs text-muted-foreground">
      <span>账户</span>
      <Select
        name="accountId"
        required
        value={entryAccountId || null}
        onValueChange={(value) => void handleAccountChange(value)}
      >
        <SelectTrigger aria-label="账户" className="w-full">
          <SelectValue placeholder="选择账户">
            {selectedAccount ? accountDisplayLabel(selectedAccount) : '选择账户'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {accountDisplayLabel(account)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
