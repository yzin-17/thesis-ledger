// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReconciliationSheet } from '../src/features/account-data/AccountDataReconciliationSheet.js';
import { fetchReconciliationCandidates } from '../src/features/account-data/account-data.api.js';

const api = vi.hoisted(() => ({ confirm: vi.fn(), toast: vi.fn() }));
vi.mock('../src/shared/api/client', () => ({
  getDesktopApiClient: () => ({ ledger: { confirmBaselineReconciliation: api.confirm } }),
}));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => ({ add: api.toast }) }));
const account = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '审核',
  type: 'securities' as const,
  mode: 'shadow' as const,
  currency: 'CNY' as const,
  active: true,
};
const candidate = {
  candidateId: 'c1',
  baselineFactId: '22222222-2222-4222-8222-222222222222',
  symbol: '510300.SH',
  executionFactIds: ['33333333-3333-4333-8333-333333333333'],
  observedQuantity: '10',
  observedCost: '40',
  coveredQuantity: '5',
  coveredCost: '20',
  remainingQuantity: '5',
  remainingCost: '20',
  status: 'AVAILABLE' as const,
  matchBasis: ['ACCOUNT_MATCH' as const],
  conflictReasons: [],
};
const cleanups: Array<() => void> = [];
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
};
const button = (text: string) =>
  [...document.querySelectorAll('button')].find((el) => el.textContent?.includes(text))!;
const click = async (el: HTMLElement) => {
  await act(async () => el.click());
  await flush();
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  api.confirm.mockResolvedValue({ idempotentReplay: false });
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
});
async function mount() {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const client = new QueryClient();
  const closed = vi.fn();
  const data = {
    accountId: account.id,
    ruleVersion: 1 as const,
    checkpoints: [{ baselineFactId: candidate.baselineFactId, occurredAt: '2026-10-20' }],
    candidates: [candidate],
  };
  const query = {
    data,
    isPending: false,
    isFetching: false,
    isError: false,
    dataUpdatedAt: 1,
    refetch: vi.fn(),
  };
  const render = async (patch = {}, ready = true) => {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <ReconciliationSheet
            account={account}
            open
            query={{ ...query, ...patch } as never}
            ledgerRevision="7"
            ledgerReady={ready}
            onOpenChange={closed}
          />
        </QueryClientProvider>,
      ),
    );
    await flush();
  };
  cleanups.push(() => {
    act(() => root.unmount());
    client.clear();
    node.remove();
  });
  await render();
  return { render, query, closed };
}
describe('无模型确定性对账', () => {
  it('选择只展示依据，独立确认才写入精确候选', async () => {
    const { closed } = await mount();
    await click(button('510300.SH'));
    expect(document.body.textContent).toContain('账户一致');
    expect(document.body.textContent).toContain('快照时间：2026-10-20');
    expect(document.body.textContent).toContain('覆盖成本：20');
    expect(document.body.textContent).not.toContain(candidate.baselineFactId);
    expect(api.confirm).not.toHaveBeenCalled();
    await click(button('确认对账并写入账本'));
    expect(api.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: account.id,
        baselineFactId: candidate.baselineFactId,
        executionFactIds: candidate.executionFactIds,
        expectedLedgerRevision: '7',
        ruleVersion: 1,
      }),
    );
    expect(closed).toHaveBeenCalledWith(false);
  });
  it('候选刷新或账本尚未就绪时不能复用原选择', async () => {
    const { render } = await mount();
    await click(button('510300.SH'));
    await render({ dataUpdatedAt: 2 });
    expect(button('确认对账并写入账本')).toBeUndefined();
    await click(button('510300.SH'));
    await render({}, false);
    expect(button('确认对账并写入账本')).toBeUndefined();
    expect(api.confirm).not.toHaveBeenCalled();
  });
  it('读取失败不允许消费旧缓存确认', async () => {
    const { render } = await mount();
    await click(button('510300.SH'));
    await render({ isError: true });
    expect(document.body.textContent).toContain('对账候选读取失败');
    expect(button('确认对账并写入账本')).toBeUndefined();
  });
  it('空原因和失败都不关闭审核，也不会自动重试', async () => {
    const { closed } = await mount();
    await click(button('510300.SH'));
    const field = document.querySelector('textarea')!;
    const set = async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          field,
          value,
        );
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    await set(' ');
    await click(button('确认对账并写入账本'));
    expect(api.confirm).not.toHaveBeenCalled();
    api.confirm.mockRejectedValue(new Error('offline'));
    await set('人工核对');
    await click(button('确认对账并写入账本'));
    expect(api.confirm).toHaveBeenCalledOnce();
    expect(closed).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('对账确认失败，请检查候选和服务状态。');
    const first = api.confirm.mock.calls[0]![0];
    await click(button('确认对账并写入账本'));
    expect(api.confirm).toHaveBeenCalledTimes(2);
    expect(api.confirm.mock.calls[1]![0]).toEqual(first);
  });
  it('账户不匹配的合法响应仍按合同错误拒绝', async () => {
    await expect(
      fetchReconciliationCandidates(account.id, {
        getReconciliationCandidates: vi
          .fn()
          .mockResolvedValue({ accountId: '44444444-4444-4444-8444-444444444444' }),
      }),
    ).rejects.toThrow();
  });
});
