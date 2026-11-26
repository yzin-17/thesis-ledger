// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { riskKeys } from '../src/features/risk/risk.queries';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CashObservationSheet } from '../src/features/account-data/AccountDataCashObservationSheet';
import { AdvancedJsonSheet } from './fixtures/journal/AdvancedJsonSheet.js';
import { RiskRuleEditorSheet } from '../src/features/risk/RiskRuleEditorSheet';
import type { RiskRuleRecord } from '../src/features/risk/risk.types';

const api = vi.hoisted(() => ({ confirm: vi.fn(), close: vi.fn(), save: vi.fn() }));
vi.mock('../src/components/ui/confirm-dialog', () => ({
  useConfirmDialog: () => ({ confirm: api.confirm }),
}));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => ({ add: vi.fn() }) }));
vi.mock('../src/features/portfolio/portfolio.mutations', () => ({
  useSaveCashBalanceMutation: () => ({ isPending: false, mutateAsync: api.save }),
}));
// 目录搜索不属于本组关闭保护；风险表单、阈值和关闭 Hook 均使用实际实现。
vi.mock('../src/features/market-data/InstrumentOptionField', () => ({
  InstrumentOptionField: () => null,
}));

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(riskKeys.riskNotificationRouting(), {
    availableRoutes: [],
    selectedProviders: [],
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});
async function render(node: ReactNode) {
  await act(async () =>
    root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>),
  );
}
async function fill(selector: string, value: string) {
  const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function beginClose() {
  let finish!: (confirmed: boolean) => void;
  api.confirm.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === '取消',
  )!;
  await act(async () => cancel.click());
  expect(api.confirm).toHaveBeenCalledOnce();
  return async () => {
    await act(async () => {
      finish(true);
      await Promise.resolve();
    });
  };
}

describe('实际表单的关闭确认快照', () => {
  it('现金快照切换到另一账户后，旧确认不关闭新账户面板或提交资金', async () => {
    const account = {
      id: 'account-1',
      name: '受控账户',
      type: 'securities' as const,
      mode: 'actual' as const,
      currency: 'CNY' as const,
      active: true,
    };
    const panel = (id: string) => (
      <CashObservationSheet
        account={{ ...account, id }}
        open
        onOpenChange={api.close}
        onSaved={vi.fn()}
      />
    );
    await render(panel(account.id));
    await fill('#cash-observation-amount', '12.34567890123456789');
    const confirm = await beginClose();
    await render(panel('account-2'));
    await confirm();
    expect(api.close).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>('#cash-observation-amount')!.value).toBe('0');
  });

  it('高级 JSON 从父级更新后，旧确认保留当前内容且不应用到业务', async () => {
    const panel = (value: unknown) => (
      <AdvancedJsonSheet
        value={value}
        mode="single"
        open
        onOpenChange={api.close}
        onApply={api.save}
      />
    );
    await render(panel({ original: true }));
    await fill('textarea', '{"edited":1}');
    const confirm = await beginClose();
    await render(panel({ refreshed: '新内容' }));
    await confirm();
    expect(api.close).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
    expect(document.querySelector('textarea')!.value).toBe(
      JSON.stringify({ refreshed: '新内容' }, null, 2),
    );
  });

  it('风险规则切换时即使新规则内容与旧草稿相同，也不消费旧确认', async () => {
    const rule: RiskRuleRecord = {
      id: 'rule-1',
      version: 1,
      kind: 'price-below',
      scope: 'security',
      severity: 'warning',
      threshold: 10,
      symbol: '600519.SH',
      accountId: null,
      enabled: true,
      needsRepair: false,
      repairReason: null,
      archivedAt: null,
      effectiveAt: '2026-11-07T00:00:00.000Z',
    };
    const panel = (value: RiskRuleRecord) => (
      <RiskRuleEditorSheet
        rule={value}
        open
        accounts={[]}
        positions={[]}
        pending={false}
        onOpenChange={api.close}
        onSubmit={api.save}
      />
    );
    await render(panel(rule));
    await fill('#risk-rule-threshold', '20');
    const confirm = await beginClose();
    await render(panel({ ...rule, id: 'rule-2', threshold: 20 }));
    await confirm();
    expect(api.close).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>('#risk-rule-threshold')!.value).toBe('20');
  });
});
