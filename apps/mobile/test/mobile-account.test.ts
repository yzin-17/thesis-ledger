import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ThesisLedgerApiError, type AccountResponse } from '@thesis-ledger/api-client';

import {
  confirmMobileAccountDeletion,
  createMobileAccountDeletionHandler,
  mobileAccountDeletionErrorMessage,
  type MobileConfirmationButton,
} from '../src/mobile-account.actions.js';
import {
  fetchMobileAccounts,
  mobileAccountKeys,
  refreshMobileAccountData,
  refreshMobileAccountDataBestEffort,
  resolveMobileAccountSelection,
} from '../src/mobile-account.queries.js';

const account: AccountResponse = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '模拟证券账户',
  institution: null,
  type: 'securities',
  mode: 'shadow',
  currency: 'CNY',
  active: false,
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

describe('Mobile 账户永久删除', () => {
  it('按实际和模拟范围查询，并始终包含停用账户', async () => {
    const list = vi.fn().mockResolvedValue([account]);

    await fetchMobileAccounts('actual', { list, permanentDelete: vi.fn() });
    await fetchMobileAccounts('shadow', { list, permanentDelete: vi.fn() });

    expect(list).toHaveBeenNthCalledWith(1, { includeInactive: true, mode: 'actual' });
    expect(list).toHaveBeenNthCalledWith(2, { includeInactive: true, mode: 'shadow' });
  });

  it('原生确认显示账户名和不可恢复提示，取消或 dismiss 时不删除', async () => {
    let buttons: MobileConfirmationButton[] = [];
    let title = '';
    let message = '';
    let cancelable = false;
    let onDismiss = () => undefined;
    const confirm = (candidate: AccountResponse) =>
      confirmMobileAccountDeletion(account, (nextTitle, nextMessage, nextButtons, options) => {
        expect(candidate).toBe(account);
        title = nextTitle;
        message = nextMessage;
        buttons = nextButtons;
        cancelable = options.cancelable;
        onDismiss = options.onDismiss;
      });
    const permanentlyDelete = vi.fn();
    const handler = createMobileAccountDeletionHandler({
      isPending: () => false,
      confirm,
      permanentlyDelete,
      onSuccess: vi.fn(),
      onError: vi.fn(),
    });
    const deletion = handler(account);

    expect(title).toBe('永久删除账户“模拟证券账户”？');
    expect(message).toBe('账户“模拟证券账户”删除后无法恢复。');
    expect(cancelable).toBe(true);
    expect(onDismiss).toBeTypeOf('function');
    expect(buttons.map((button) => button.text)).toEqual(['取消', '永久删除']);
    expect(buttons[1]).toMatchObject({ style: 'destructive' });
    onDismiss();
    await deletion;
    expect(permanentlyDelete).not.toHaveBeenCalled();

    let cancelButtons: MobileConfirmationButton[] = [];
    const cancellation = confirmMobileAccountDeletion(account, (_title, _message, nextButtons) => {
      cancelButtons = nextButtons;
    });
    cancelButtons[0]?.onPress();
    await expect(cancellation).resolves.toBe(false);
  });

  it('快速重复调用只确认并删除一次', async () => {
    const confirmation = deferred<boolean>();
    const confirm = vi.fn().mockReturnValue(confirmation.promise);
    const permanentlyDelete = vi.fn().mockResolvedValue(undefined);
    const handler = createMobileAccountDeletionHandler({
      isPending: () => false,
      confirm,
      permanentlyDelete,
      onSuccess: vi.fn(),
      onError: vi.fn(),
    });

    const first = handler(account);
    const second = handler(account);
    expect(confirm).toHaveBeenCalledOnce();
    confirmation.resolve(true);
    await Promise.all([first, second]);

    expect(permanentlyDelete).toHaveBeenCalledOnce();
  });

  it('成功后失效并重取账户数据，同时刷新既有 Portfolio/Risk store', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const refetchQueries = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);

    await refreshMobileAccountData({ invalidateQueries, refetchQueries }, { refresh });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: mobileAccountKeys.root });
    expect(refetchQueries).toHaveBeenCalledWith({ queryKey: mobileAccountKeys.root });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('删除成功后的刷新失败不会改写删除成功结果', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const refetchQueries = vi.fn().mockRejectedValue(new Error('offline'));
    const refresh = vi.fn().mockResolvedValue(undefined);

    await expect(
      refreshMobileAccountDataBestEffort({ invalidateQueries, refetchQueries }, { refresh }),
    ).resolves.toBeUndefined();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: mobileAccountKeys.root });
    expect(refetchQueries).toHaveBeenCalledWith({ queryKey: mobileAccountKeys.root });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('删除选择账户后切换到剩余账户，最后账户解析为空', () => {
    const fallback = { ...account, id: '00000000-0000-4000-8000-000000000002' };

    expect(resolveMobileAccountSelection([fallback], account.id)).toBe(fallback.id);
    expect(resolveMobileAccountSelection([], account.id)).toBeNull();
  });

  it('缓存账户仍可见时，查询错误提供可见重试模型', () => {
    const source = readFileSync(
      new URL('../src/components/MobileAccountScreen.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('showQueryRetry: Boolean(error)');
    expect(source).toContain('accountState.showQueryRetry && (');
    expect(source).toContain('账户列表未刷新，请检查网络后重试。');
    expect(source).toContain('onPress={onRetry}');
  });

  it('409 保留服务端中文原因，网络错误明确提示重试', () => {
    const conflict = new ThesisLedgerApiError(409, {
      error: 'ACCOUNT_IN_USE',
      message: '账户存在持仓记录，无法永久删除',
    });

    expect(mobileAccountDeletionErrorMessage(conflict)).toBe('账户存在持仓记录，无法永久删除');
    expect(mobileAccountDeletionErrorMessage(new Error('offline'))).toContain('重试');
  });
});
