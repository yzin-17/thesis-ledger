import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ThesisLedgerApiError, type AccountResponse } from '@thesis-ledger/api-client';

import {
  confirmMobileAccountDeletion,
  createMobileAccountDeletionHandler,
  mobileAccountDeletionErrorMessage,
  type MobileConfirmationButton,
} from '../src/mobile-account.actions.js';

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
