import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';

import {
  createAccountActionHandlers,
  permanentAccountDeletionErrorMessage,
} from '../src/features/portfolio/portfolio.account-actions.js';
import { resolveAccountSelection } from '../src/features/account-data/AccountDataPage.js';
import { permanentlyDeleteAccount } from '../src/features/portfolio/portfolio.api.js';
import type { PortfolioActionDependencies } from '../src/features/portfolio/portfolio.actions.js';
import type { Account } from '../src/features/portfolio/portfolio.types.js';

const account: Account = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '模拟证券账户',
  type: 'securities',
  mode: 'shadow',
  currency: 'CNY',
  active: true,
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const actionDependencies = ({
  busyAction = null,
  confirmed = true,
  deletionError,
  managementReloadError,
  confirmationPromise,
}: {
  busyAction?: string | null;
  confirmed?: boolean;
  deletionError?: unknown;
  managementReloadError?: unknown;
  confirmationPromise?: Promise<boolean>;
} = {}) => {
  const confirm = confirmationPromise
    ? vi.fn().mockReturnValue(confirmationPromise)
    : vi.fn().mockResolvedValue(confirmed);
  const mutateAsync = deletionError
    ? vi.fn().mockRejectedValue(deletionError)
    : vi.fn().mockResolvedValue(undefined);
  const setBusyAction = vi.fn();
  const loadManagedAccounts = managementReloadError
    ? vi.fn().mockRejectedValue(managementReloadError)
    : vi.fn().mockResolvedValue(undefined);
  const onSaved = vi.fn();
  const add = vi.fn();
  const dependencies = {
    busyAction,
    confirm,
    setBusyAction,
    loadManagedAccounts,
    onSaved,
    toastManager: { add },
    markDirty: vi.fn(),
    mutations: { permanentlyDeleteAccount: { mutateAsync } },
  } as unknown as PortfolioActionDependencies;

  return {
    ...createAccountActionHandlers(dependencies),
    add,
    confirm,
    loadManagedAccounts,
    mutateAsync,
    onSaved,
    setBusyAction,
  };
};

describe('Desktop 账户永久删除', () => {
  it('通过共享 accounts client 调用独立永久删除 endpoint', async () => {
    const permanentDelete = vi.fn().mockResolvedValue(undefined);

    await permanentlyDeleteAccount(account.id, { permanentDelete });

    expect(permanentDelete).toHaveBeenCalledWith(account.id);
  });

  it('取消确认时不发请求', async () => {
    const actions = actionDependencies({ confirmed: false });

    await actions.permanentlyDeleteAccount(account);

    expect(actions.confirm).toHaveBeenCalledWith({
      title: '永久删除账户“模拟证券账户”？',
      description: '账户“模拟证券账户”删除后无法恢复。',
      confirmLabel: '永久删除',
      cancelLabel: '取消',
      variant: 'destructive',
    });
    expect(actions.mutateAsync).not.toHaveBeenCalled();
  });

  it('已有账户操作 pending 时不重复确认或提交', async () => {
    const actions = actionDependencies({ busyAction: `account-delete:${account.id}` });

    await actions.permanentlyDeleteAccount(account);

    expect(actions.confirm).not.toHaveBeenCalled();
    expect(actions.mutateAsync).not.toHaveBeenCalled();
  });

  it('同一 handler 的快速重复调用只确认和提交一次', async () => {
    const confirmation = deferred<boolean>();
    const actions = actionDependencies({ confirmationPromise: confirmation.promise });

    const first = actions.permanentlyDeleteAccount(account);
    const second = actions.permanentlyDeleteAccount(account);
    expect(actions.confirm).toHaveBeenCalledOnce();

    confirmation.resolve(true);
    await Promise.all([first, second]);

    expect(actions.mutateAsync).toHaveBeenCalledOnce();
  });

  it('成功后刷新管理列表和路由数据', async () => {
    const actions = actionDependencies();

    await actions.permanentlyDeleteAccount(account);

    expect(actions.mutateAsync).toHaveBeenCalledWith(account.id);
    expect(actions.loadManagedAccounts).not.toHaveBeenCalled();
    expect(actions.onSaved).toHaveBeenCalledOnce();
    expect(actions.setBusyAction).toHaveBeenNthCalledWith(1, `account-delete:${account.id}`);
    expect(actions.setBusyAction).toHaveBeenLastCalledWith(null);
    expect(actions.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: '账户已永久删除', type: 'success' }),
    );
  });

  it('删除成功后管理列表刷新失败不会改写为删除失败', async () => {
    const actions = actionDependencies({ managementReloadError: new Error('offline') });

    await actions.permanentlyDeleteAccount(account);
    await Promise.resolve();

    expect(actions.onSaved).toHaveBeenCalledOnce();
    expect(actions.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: '账户已永久删除', type: 'success' }),
    );
    expect(actions.add).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: '账户永久删除失败' }),
    );
  });

  it('保留 409 的服务端中文原因，其他失败提供网络重试提示', () => {
    const conflict = new ThesisLedgerApiError(409, {
      error: 'ACCOUNT_IN_USE',
      message: '账户存在持仓记录，无法永久删除',
    });

    expect(permanentAccountDeletionErrorMessage(conflict)).toBe('账户存在持仓记录，无法永久删除');
    expect(permanentAccountDeletionErrorMessage(new Error('offline'))).toContain('重试');
  });

  it('删除当前选择时切换至首个剩余账户，最后账户解析为空选择', () => {
    const fallback = { ...account, id: '00000000-0000-4000-8000-000000000002' };

    expect(
      resolveAccountSelection({
        accounts: [fallback],
        accountId: account.id,
        requestedAccountId: account.id,
      }),
    ).toBe(fallback.id);
    expect(
      resolveAccountSelection({ accounts: [], accountId: account.id, requestedAccountId: account.id }),
    ).toBe('');
  });
});
