import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
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
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { accountCurrencyLabel, accountTypeLabel, type Account } from './portfolio.types.js';
import type { PortfolioManagementViewProps } from './PortfolioManagementView.types.js';
import { useOptionalPortfolioMode } from './portfolio-mode-context.js';

const accountToggleLabel = (busy: boolean, active: boolean) => {
  if (busy) return active ? '停用中…' : '启用中…';
  return active ? '停用' : '重新启用';
};

const accountSaveLabel = (busy: boolean, editing: boolean) => {
  if (busy) return editing ? '保存中…' : '创建中…';
  return editing ? '保存账户' : '创建账户';
};

export function AccountManagementSection(props: PortfolioManagementViewProps) {
  const currentMode = useOptionalPortfolioMode()?.mode;
  const {
    managedAccounts,
    managedAccountsError,
    managedAccountsPending,
    onRetryManagedAccounts,
    onAccountEntry,
    busyAction,
    accountSheetOpen,
    accountFormInline = false,
    markDirty,
    setEditingAccount,
    setAccountSheetOpen,
    toggleAccount,
    permanentlyDeleteAccount,
  } = props;

  if (accountFormInline && accountSheetOpen) {
    return (
      <div
        className="flex h-full min-h-0 flex-col animate-in fade-in slide-in-from-right-6 duration-200 motion-reduce:animate-none"
        data-account-manager-view="form"
      >
        <AccountFormContent {...props} inline />
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          accountFormInline &&
            'min-h-0 overflow-y-auto animate-in fade-in slide-in-from-left-6 duration-200 motion-reduce:animate-none',
        )}
        data-account-manager-view={accountFormInline ? 'list' : undefined}
      >
        {accountFormInline && (
          <SheetHeader className="mb-6">
            <SheetTitle>账户设置</SheetTitle>
            <SheetDescription id="account-manager-description">
              账户是成交、持仓快照和现金快照的容器。
            </SheetDescription>
          </SheetHeader>
        )}
        <div className="flex items-center justify-between gap-4">
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
        {managedAccountsError && (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>账户列表暂未更新</AlertTitle>
            <AlertDescription>
              已成功保存的账户无需再次创建或保存。请重新读取列表。
              <Button
                type="button"
                variant="outline"
                disabled={managedAccountsPending}
                onClick={onRetryManagedAccounts}
              >
                重新读取账户
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {managedAccounts.length > 0 ? (
          <div className="account-list" aria-label="已有账户">
            {managedAccounts.map((account) => (
              <div key={account.id}>
                <span>
                  {account.name}
                  <small>
                    {(account.institution || '未填写机构') +
                      ' · ' +
                      accountTypeLabel(account.type) +
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
                      disabled={Boolean(currentMode && account.mode !== currentMode)}
                      title={currentMode && account.mode !== currentMode ? '请先使用全局开关切换到账户所属范围' : undefined}
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
                    variant={account.active === false ? 'link' : 'destructive'}
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
                  <Button
                    size="sm"
                    type="button"
                    variant="destructive"
                    disabled={busyAction !== null}
                    aria-busy={busyAction === `account-delete:${account.id}`}
                    onClick={() => void permanentlyDeleteAccount(account)}
                  >
                    {busyAction === `account-delete:${account.id}` && (
                      <LoaderCircle
                        data-icon="inline-start"
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    {busyAction === `account-delete:${account.id}` ? '删除中…' : '删除'}
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
      </div>
      {!accountFormInline && (
        <Sheet open={accountSheetOpen} onOpenChange={setAccountSheetOpen}>
          <SheetContent
            side="right"
            aria-describedby="account-form-description"
            size="form"
            className="h-[100dvh] min-h-0 overflow-hidden p-6"
          >
            <AccountFormContent {...props} />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

function AccountFormContent({
  inline = false,
  ...props
}: PortfolioManagementViewProps & { inline?: boolean }) {
  const { busyAction, editingAccount, markDirty, setAccountSheetOpen, submitAccount } = props;
  const globalMode = useOptionalPortfolioMode()?.mode ?? 'actual';
  const descriptionId = inline ? 'account-manager-description' : 'account-form-description';

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6">
      <div className="shrink-0">
        <div className="flex items-start gap-1.5">
          {inline && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="返回账户设置"
              disabled={busyAction !== null}
              onClick={() => setAccountSheetOpen(false)}
            >
              <ArrowLeft data-icon="inline-start" aria-hidden="true" />
            </Button>
          )}
          <SheetHeader className="min-w-0 flex-1 shrink">
            <SheetTitle>{editingAccount ? '编辑账户' : '创建账户'}</SheetTitle>
            <SheetDescription id={descriptionId}>
              账户是持仓的容器；类型、模式和币种在出现 Ledger 事件后锁定。
            </SheetDescription>
          </SheetHeader>
        </div>
      </div>
      <form
        key={editingAccount?.id ?? 'new-account'}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-6"
        onChange={() => markDirty()}
        onSubmit={(event) => void submitAccount(event)}
      >
        <div className="grid -mx-1 -my-1 min-h-0 max-w-none flex-1 content-start gap-6 overflow-y-auto px-1 py-1">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="account-name">账户名称</FieldLabel>
              <Input
                id="account-name"
                disabled={busyAction !== null}
                name="name"
                required
                maxLength={80}
                defaultValue={editingAccount?.name}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-institution">机构（可选）</FieldLabel>
              <Input
                id="account-institution"
                disabled={busyAction !== null}
                name="institution"
                maxLength={80}
                defaultValue={editingAccount?.institution ?? undefined}
                placeholder="例如：支付宝、某某证券"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-type">账户类型</FieldLabel>
              <Select
                name="type"
                disabled={busyAction !== null}
                defaultValue={editingAccount?.type ?? 'securities'}
              >
                <SelectTrigger id="account-type" className="w-full">
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
            </Field>
            <Field>
              <FieldLabel htmlFor="account-mode">账户模式</FieldLabel>
              {editingAccount ? <Select
                name="mode"
                disabled={busyAction !== null}
                defaultValue={editingAccount?.mode ?? 'actual'}
              >
                <SelectTrigger id="account-mode" className="w-full">
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
              </Select> : <>
                <Input id="account-mode" aria-label="账户模式" value={globalMode === 'shadow' ? '模拟账户' : '实际账户'} readOnly />
                <input type="hidden" name="mode" value={globalMode} />
              </>}
            </Field>
            <Field>
              <FieldLabel htmlFor="account-currency">币种</FieldLabel>
              <Input
                id="account-currency"
                value={accountCurrencyLabel(editingAccount?.currency ?? 'CNY')}
                readOnly
                aria-label="币种"
              />
            </Field>
          </FieldGroup>
        </div>
        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busyAction !== null}
            onClick={() => setAccountSheetOpen(false)}
          >
            取消
          </Button>
          <Button type="submit" variant="default" disabled={busyAction !== null}>
            {busyAction === 'account-save' && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {accountSaveLabel(busyAction === 'account-save', Boolean(editingAccount))}
          </Button>
        </SheetFooter>
      </form>
    </div>
  );
}
