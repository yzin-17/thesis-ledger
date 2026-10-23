// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecurringCashDeposits } from './AccountDataRecurringCashDeposits.js';
import { CashTransferCorrectionSheet } from './AccountDataCashTransferCorrectionSheet.js';
import type { CashTransferEvent } from './account-data.types.js';
import { transactionAmount } from './account-data.helpers.js';
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog';

const state = vi.hoisted(() => ({ pending: false }));

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  confirm: vi.fn(),
  skip: vi.fn(),
  replaceTransfer: vi.fn(),
  voidTransfer: vi.fn(),
  restoreTransfer: vi.fn(),
}));
const account = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '工资现金账户',
  type: 'cash' as const,
  mode: 'actual' as const,
  currency: 'CNY' as const,
  active: true,
};
vi.mock('./account-data.cash.queries.js', () => ({
  useCashDepositQueries: () => ({
    plans: { data: [], isPending: false, isError: false },
    occurrences: {
      data: [
        {
          id: 'occurrence-1',
          accountId: account.id,
          planName: '工资入账',
          periodKey: '2026-08',
          scheduledFor: '2026-08-31T01:00:00.000Z',
          expectedAmount: '200',
          currency: 'CNY',
          status: 'PENDING',
          version: 1,
        },
      ],
      isPending: false,
      isError: false,
    },
  }),
  useCashOperationsMutations: () => ({
    createPlan: { isPending: state.pending, mutateAsync: mocks.create },
    updatePlan: { isPending: false, mutateAsync: vi.fn() },
    confirmOccurrence: { isPending: state.pending, mutateAsync: mocks.confirm },
    skipOccurrence: { isPending: state.pending, mutateAsync: mocks.skip },
    reopenOccurrence: { isPending: false, mutateAsync: vi.fn() },
    changePlanState: { isPending: false, mutateAsync: vi.fn() },
    replaceTransfer: { isPending: state.pending, mutateAsync: mocks.replaceTransfer },
    voidTransfer: { isPending: false, mutateAsync: mocks.voidTransfer },
    restoreTransfer: { isPending: false, mutateAsync: mocks.restoreTransfer },
  }),
}));
vi.mock('@/components/ui/toast', () => ({ useToastManager: () => ({ add: vi.fn() }) }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  state.pending = false;
  vi.resetAllMocks();
  for (const mutation of Object.values(mocks))
    mutation.mockRejectedValue(new Error('受控保存失败，请重试'));
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
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
  vi.unstubAllGlobals();
});

async function render(content: ReactNode = <RecurringCashDeposits account={account} />) {
  await act(async () => {
    root.render(<ConfirmDialogProvider>{content}</ConfirmDialogProvider>);
    await Promise.resolve();
  });
}

async function clickButton(text: string) {
  const button = [...document.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === text,
  );
  expect(button, text).toBeDefined();
  await act(async () => {
    button!.click();
    await Promise.resolve();
  });
}

function input(id: string) {
  const element = document.getElementById(id);
  expect(element).toBeInstanceOf(HTMLInputElement);
  return element as HTMLInputElement;
}

async function fill(id: string, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input(id),
      value,
    );
    input(id).dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}

function expectSubmissionError() {
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(
    '受控保存失败，请重试',
  );
}

describe('定期入账失败后的表单恢复', () => {
  it.each(['新建计划', '确认入账', '跳过'])('%s 提交中不能通过关闭入口退出', async (entry) => {
    await render();
    await clickButton(entry);
    state.pending = true;
    await render();
    await clickButton('关闭');
    expect(document.querySelector('[role="dialog"] [type="submit"]')).not.toBeNull();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(true);
  });

  it('计划改动取消需要确认，继续编辑仍保留名称', async () => {
    await render();
    await clickButton('新建计划');
    await fill('cash-plan-name', '应保留的计划');
    await clickButton('取消');
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    await clickButton('继续编辑');
    expect(input('cash-plan-name').value).toBe('应保留的计划');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('保存计划失败保留名称和金额，仍能重试成功', async () => {
    await render();
    await clickButton('新建计划');
    await fill('cash-plan-name', '保留输入的计划');
    await fill('cash-plan-amount', '123.45');
    await clickButton('保存计划');
    expectSubmissionError();
    expect(input('cash-plan-name').value).toBe('保留输入的计划');
    expect(input('cash-plan-amount').value).toBe('123.45');
    mocks.create.mockResolvedValueOnce({});
    await clickButton('保存计划');
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
  });

  it('确认失败保留实际金额和日期，重试仍提交同一实例版本', async () => {
    await render();
    await clickButton('确认入账');
    await fill('cash-occurrence-amount', '123.45');
    await fill('cash-occurrence-date', '2026-10-15T12:34');
    await clickButton('确认并写入 Ledger');
    expectSubmissionError();
    expect(input('cash-occurrence-amount').value).toBe('123.45');
    expect(input('cash-occurrence-date').value).toBe('2026-10-15T12:34');
    mocks.confirm.mockResolvedValueOnce({});
    await clickButton('确认并写入 Ledger');
    expect(mocks.confirm).toHaveBeenCalledTimes(2);
    expect(mocks.confirm.mock.calls[1]).toEqual(mocks.confirm.mock.calls[0]);
    expect(mocks.confirm).toHaveBeenLastCalledWith({
      id: 'occurrence-1',
      input: {
        expectedVersion: 1,
        actualAmount: '123.45',
        occurredAt: new Date('2026-10-15T12:34').toISOString(),
      },
    });
  });

  it('跳过失败保留原因，允许修改后再次提交', async () => {
    await render();
    await clickButton('跳过');
    await fill('cash-occurrence-reason', '本期需要核对');
    await clickButton('确认跳过');
    expectSubmissionError();
    expect(input('cash-occurrence-reason').value).toBe('本期需要核对');
    await fill('cash-occurrence-reason', '核对后决定跳过');
    mocks.skip.mockResolvedValueOnce({});
    await clickButton('确认跳过');
    expect(mocks.skip).toHaveBeenLastCalledWith({
      id: 'occurrence-1',
      expectedVersion: 1,
      reason: '核对后决定跳过',
    });
  });
});

const transfer: CashTransferEvent = {
  version: 3,
  eventId: '22222222-2222-4222-8222-222222222222',
  factId: '33333333-3333-4333-8333-333333333333',
  accountId: account.id,
  ledgerRevision: '1',
  type: 'CASH_FLOW',
  revisionAction: 'CREATE',
  occurredAt: '2026-10-15T04:34:00.000Z',
  timePrecision: 'INSTANT',
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'a0',
  recordedAt: '2026-10-15T04:35:00.000Z',
  payloadVersion: 1,
  source: { category: 'MANUAL', channel: 'desktop-cash-transfer', externalId: 'test-transfer-1' },
  actorId: 'desktop-user',
  payload: {
    direction: 'OUTFLOW',
    category: 'TRANSFER',
    amount: '50',
    currency: 'CNY',
    transfer: {
      transferId: '44444444-4444-4444-8444-444444444444',
      counterpartyAccountId: '55555555-5555-4555-8555-555555555555',
      leg: 'OUTFLOW',
    },
  },
};

describe('划转错误与账本金额', () => {
  it('更正划转提交中不能关闭，原因草稿取消仍受保护', async () => {
    const onOpenChange = vi.fn();
    const node = <CashTransferCorrectionSheet event={transfer} mode="replace" open onOpenChange={onOpenChange} />;
    await render(node);
    await fill('cash-transfer-correction-reason', '需要保留');
    state.pending = true;
    await render(node);
    await clickButton('关闭');
    expect(onOpenChange).not.toHaveBeenCalled();
    state.pending = false;
    await render(node);
    await clickButton('取消');
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    await clickButton('继续编辑');
    expect(input('cash-transfer-correction-reason').value).toBe('需要保留');
  });
  it('本地原因校验与服务端失败均保留更正表单，重试成功后才关闭', async () => {
    const onOpenChange = vi.fn();
    await render(
      <CashTransferCorrectionSheet
        event={transfer}
        mode="replace"
        open
        onOpenChange={onOpenChange}
      />,
    );
    await clickButton('确认更正');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('请填写');
    expect(mocks.replaceTransfer).not.toHaveBeenCalled();
    await fill('cash-transfer-correction-amount', '40');
    await fill('cash-transfer-correction-reason', '核对双端金额');
    await clickButton('确认更正');
    expectSubmissionError();
    expect(input('cash-transfer-correction-amount').value).toBe('40');
    expect(input('cash-transfer-correction-reason').value).toBe('核对双端金额');
    expect(onOpenChange).not.toHaveBeenCalled();
    mocks.replaceTransfer.mockResolvedValueOnce({});
    await clickButton('确认更正');
    expect(mocks.replaceTransfer.mock.calls[1]).toEqual(mocks.replaceTransfer.mock.calls[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('现金流以方向、原始精度和币种显示金额', () => {
    expect(transactionAmount(transfer, null)).toBe('-50 CNY');
    expect(
      transactionAmount(
        { ...transfer, payload: { ...transfer.payload, direction: 'INFLOW', amount: '123.45' } },
        null,
      ),
    ).toBe('+123.45 CNY');
  });
});
