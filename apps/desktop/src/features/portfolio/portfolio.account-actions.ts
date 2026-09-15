import type { FormEvent } from 'react';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';

import type { Account, PortfolioChangeImpact } from './portfolio.types.js';
import type { SaveAccountInput } from './portfolio.api.js';
import type { PortfolioActionDependencies } from './portfolio.actions.js';
import { formText } from '../shared/display.js';

export const permanentAccountDeletionErrorMessage = (error: unknown) => {
  if (error instanceof ThesisLedgerApiError && error.status === 409)
    return error.payload?.message ?? '账户仍有关联数据，暂时无法永久删除。';
  return '网络或服务暂不可用，请检查网络后重试。';
};

export const accountChangeImpact = (mode: Account['mode'], accountId: string): PortfolioChangeImpact => ({
  mode,
  accountIds: [accountId],
  accounts: true,
});

export const createAccountActionHandlers = ({
  busyAction,
  editingAccount,
  setBusyAction,
  setEditingAccount,
  setAccountSheetOpen,
  markDirty,
  onSaved,
  toastManager,
  confirm,
  mutations,
}: PortfolioActionDependencies) => {
  let permanentDeletionInProgress = false;

  const submitAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyAction) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const isEditing = Boolean(editingAccount);
    setBusyAction('account-save');
    try {
      const input: SaveAccountInput = {
        name: formText(form, 'name'),
        ...(formText(form, 'institution') ? { institution: formText(form, 'institution') } : {}),
        type: formText(form, 'type') as Account['type'],
        mode: (formText(form, 'mode') || 'actual') as Account['mode'],
        currency: 'CNY',
      };
      const savedAccount = await mutations.saveAccount.mutateAsync({
        ...(editingAccount?.id ? { accountId: editingAccount.id } : {}),
        input,
      });
      formElement.reset();
      setEditingAccount(null);
      markDirty(false);
      setAccountSheetOpen(false);
      onSaved(accountChangeImpact(savedAccount.mode ?? input.mode, savedAccount.id ?? editingAccount?.id ?? ''));
      toastManager.add({
        title: isEditing ? '账户已更新' : '账户已创建',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: isEditing ? '账户更新失败' : '账户创建失败',
        description: isEditing
          ? '有 Ledger 历史时类型、模式和币种不可修改。'
          : '请检查名称、机构和账户类型。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const toggleAccount = async (account: Account) => {
    if (busyAction) return;
    const active = account.active !== false;
    if (
      active &&
      !(await confirm({
        title: `停用账户“${account.name}”？`,
        description: '停用后账户仍保留历史数据，但不能继续用于录入。',
        confirmLabel: '停用账户',
        cancelLabel: '取消',
        variant: 'destructive',
      }))
    )
      return;
    setBusyAction(`account-toggle:${account.id}`);
    try {
      await mutations.toggleAccount.mutateAsync({ accountId: account.id, active });
      markDirty(false);
      onSaved(accountChangeImpact(account.mode, account.id));
      toastManager.add({
        title: active ? '账户已停用' : '账户已重新启用',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: active ? '账户停用失败' : '账户重新启用失败',
        description: active ? '账户仍有余额，需先清空持仓和现金。' : '请稍后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const permanentlyDeleteAccount = async (account: Account) => {
    if (busyAction || permanentDeletionInProgress) return;
    permanentDeletionInProgress = true;
    try {
      const confirmed = await confirm({
        title: `永久删除账户“${account.name}”？`,
        description: `账户“${account.name}”删除后无法恢复。`,
        confirmLabel: '永久删除',
        cancelLabel: '取消',
        variant: 'destructive',
      });
      if (!confirmed) return;
      setBusyAction(`account-delete:${account.id}`);
      try {
        await mutations.permanentlyDeleteAccount.mutateAsync(account.id);
        markDirty(false);
        onSaved(accountChangeImpact(account.mode, account.id));
        toastManager.add({
          title: '账户已永久删除',
          type: 'success',
          timeout: 2800,
        });
      } catch (error) {
        toastManager.add({
          title: '账户永久删除失败',
          description: permanentAccountDeletionErrorMessage(error),
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
      } finally {
        setBusyAction(null);
      }
    } finally {
      permanentDeletionInProgress = false;
    }
  };

  return { submitAccount, toggleAccount, permanentlyDeleteAccount };
};
