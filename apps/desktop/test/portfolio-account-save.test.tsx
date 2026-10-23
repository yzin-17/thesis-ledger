// @vitest-environment jsdom
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { createAccountActionHandlers } from '../src/features/portfolio/portfolio.account-actions.js';
import type { PortfolioActionDependencies } from '../src/features/portfolio/portfolio.actions.js';

const account = {
  id: 'owned-account',
  name: '专用测试账户',
  mode: 'actual',
  type: 'securities',
  currency: 'CNY',
};
function setup() {
  const form = document.createElement('form');
  for (const [name, value] of Object.entries(account)) {
    const input = document.createElement('input');
    input.name = name;
    input.value = value;
    form.append(input);
  }
  let resolveRead!: () => void;
  const reading = new Promise<void>((resolve) => {
    resolveRead = resolve;
  });
  const dependencies = {
    busyAction: null,
    editingAccount: null,
    setBusyAction: vi.fn(),
    setEditingAccount: vi.fn(),
    setAccountSheetOpen: vi.fn(),
    markDirty: vi.fn(),
    onSaved: vi.fn(),
    refreshManagedAccounts: vi.fn(() => reading),
    accountSaveErrorToastId: { current: null as string | null },
    toastManager: { add: vi.fn(() => 'account-error-toast'), close: vi.fn() },
    confirm: vi.fn().mockResolvedValue(true),
    mutations: {
      saveAccount: { mutateAsync: vi.fn(async () => account) },
      toggleAccount: { mutateAsync: vi.fn() },
    },
  };
  const handlers = createAccountActionHandlers(
    dependencies as unknown as PortfolioActionDependencies,
  );
  const event = {
    preventDefault: vi.fn(),
    currentTarget: form,
  } as unknown as FormEvent<HTMLFormElement>;
  return { dependencies, handlers, event, form, resolveRead };
}

describe('账户写入与列表恢复', () => {
  it('保存后通知读取回调拒绝仍保留成功事实并关闭表单', async () => {
    const { dependencies: d, event, resolveRead } = setup();
    const handlers = createAccountActionHandlers({ ...d,
      onSaved: vi.fn().mockRejectedValue(new Error('写后读取失败')),
    } as unknown as PortfolioActionDependencies);
    resolveRead();
    await handlers.submitAccount(event);
    expect(d.setAccountSheetOpen).toHaveBeenCalledWith(false);
    expect(d.toastManager.add).toHaveBeenCalledWith(expect.objectContaining({ title: '账户已创建', type: 'success' }));
    expect(d.toastManager.add).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(d.mutations.saveAccount.mutateAsync).toHaveBeenCalledOnce();
  });
  it.each([
    [503, '服务暂不可用', '服务暂时无法完成本次操作，请稍后重试。'],
    [409, '账户仍有余额，需先清空持仓和现金。', '账户仍有余额，需先清空持仓和现金。'],
  ])('停用账户区分服务失败和明确的业务限制（%i）', async (status, message, expected) => {
    const { dependencies: d, handlers } = setup();
    d.mutations.toggleAccount.mutateAsync.mockRejectedValue(
      new ThesisLedgerApiError(status, { error: 'CONTROLLED_FAILURE', message }),
    );
    await handlers.toggleAccount(account as Parameters<typeof handlers.toggleAccount>[0]);
    expect(d.toastManager.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: '账户停用失败', description: expected }),
    );
    expect(d.onSaved).not.toHaveBeenCalled();
    expect(d.markDirty).not.toHaveBeenCalled();
    expect(d.setBusyAction).toHaveBeenLastCalledWith(null);
  });
  it('重试只关闭本次账户保存的旧失败通知，不清理其他操作的提示', async () => {
    const { dependencies: d, handlers, event, resolveRead } = setup();
    d.mutations.saveAccount.mutateAsync.mockRejectedValueOnce(new Error('服务不可用'));
    await handlers.submitAccount(event);
    expect(d.accountSaveErrorToastId.current).toBe('account-error-toast');
    const retried = createAccountActionHandlers(d as unknown as PortfolioActionDependencies);
    const saving = retried.submitAccount(event);
    expect(d.toastManager.close).toHaveBeenCalledExactlyOnceWith('account-error-toast');
    expect(d.accountSaveErrorToastId.current).toBeNull();
    resolveRead();
    await saving;
  });

  it('写入成功后等待列表读取，读取失败不重新报写入失败或重复提交', async () => {
    const { dependencies: d, handlers, event, resolveRead } = setup();
    const saving = handlers.submitAccount(event);
    await vi.waitFor(() => expect(d.refreshManagedAccounts).toHaveBeenCalledOnce());
    expect(d.setAccountSheetOpen).not.toHaveBeenCalled();
    expect(d.setBusyAction).toHaveBeenLastCalledWith('account-save');
    resolveRead();
    await saving;
    expect(d.mutations.saveAccount.mutateAsync).toHaveBeenCalledOnce();
    expect(d.setAccountSheetOpen).toHaveBeenCalledWith(false);
    expect(d.toastManager.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: '账户已创建' }),
    );
  });

  it('写入失败保留表单值，不执行刷新或关闭', async () => {
    const { dependencies: d, handlers, event, form } = setup();
    d.mutations.saveAccount.mutateAsync.mockRejectedValue(new Error('服务不可用'));
    await handlers.submitAccount(event);
    expect(new FormData(form).get('name')).toBe(account.name);
    expect(d.refreshManagedAccounts).not.toHaveBeenCalled();
    expect(d.setAccountSheetOpen).not.toHaveBeenCalled();
    expect(d.setBusyAction).toHaveBeenLastCalledWith(null);
  });
});
