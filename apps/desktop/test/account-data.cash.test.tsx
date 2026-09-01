import { readFileSync } from 'node:fs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Toaster } from '../src/components/ui/toast.js';
import { RecurringCashDeposits } from '../src/features/account-data/AccountDataRecurringCashDeposits.js';
import {
  createManualCashTransfer,
  replaceManualCashTransfer,
  restoreManualCashTransfer,
  voidManualCashTransfer,
} from '../src/features/account-data/account-data.cash.api.js';
import { cashDepositKeys } from '../src/features/account-data/account-data.cash.queries.js';

const cashAccount = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '工资现金账户',
  type: 'cash' as const,
  mode: 'actual' as const,
  currency: 'CNY' as const,
  active: true,
};
const securitiesAccount = {
  id: '22222222-2222-4222-8222-222222222222',
  name: '证券账户',
  type: 'securities' as const,
  mode: 'actual' as const,
  currency: 'CNY' as const,
  active: true,
};

describe('账户现金操作', () => {
  it('手动划转提交前读取两端最新 Revision，并生成关联命令', async () => {
    const getEvents = vi
      .fn()
      .mockResolvedValueOnce({ events: [], ledgerRevision: '3' })
      .mockResolvedValueOnce({ events: [], ledgerRevision: '7' });
    const createCashTransfer = vi.fn(async (command) => command);

    await createManualCashTransfer(
      {
        sourceAccountId: cashAccount.id,
        targetAccountId: securitiesAccount.id,
        amount: '1200.00',
        currency: 'CNY',
        occurredAt: '2026-08-31T01:00:00.000Z',
      },
      {
        ledger: { getEvents, createCashTransfer } as never,
        cashDeposits: {} as never,
      },
    );

    expect(getEvents).toHaveBeenCalledTimes(2);
    expect(createCashTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'CREATE_CASH_TRANSFER',
        sourceAccountId: cashAccount.id,
        targetAccountId: securitiesAccount.id,
        expectedSourceLedgerRevision: '3',
        expectedTargetLedgerRevision: '7',
        amount: '1200.00',
        currency: 'CNY',
        transferId: expect.any(String),
      }),
    );
  });

  it('划转更正和作废会解析两端当前事件并成对提交', async () => {
    const transferId = '55555555-5555-4555-8555-555555555555';
    const sourceEvent = {
      version: 2,
      eventId: '66666666-6666-4666-8666-666666666666',
      accountId: cashAccount.id,
      type: 'CASH_FLOW',
      revisionAction: 'CREATE',
      occurredAt: '2026-08-31T01:00:00.000Z',
      payload: {
        direction: 'OUTFLOW',
        category: 'TRANSFER',
        amount: '1000',
        currency: 'CNY',
        transfer: { transferId, counterpartyAccountId: securitiesAccount.id, leg: 'OUTFLOW' },
      },
    } as never;
    const targetEvent = {
      ...sourceEvent,
      eventId: '77777777-7777-4777-8777-777777777777',
      accountId: securitiesAccount.id,
      payload: {
        ...sourceEvent.payload,
        direction: 'INFLOW',
        transfer: { transferId, counterpartyAccountId: cashAccount.id, leg: 'INFLOW' },
      },
    } as never;
    const getEvents = vi.fn(async (accountId: string) => ({
      events: accountId === cashAccount.id ? [sourceEvent] : [targetEvent],
      ledgerRevision: accountId === cashAccount.id ? '4' : '8',
    }));
    const replaceCashTransfer = vi.fn(async (command) => command);
    const voidCashTransfer = vi.fn(async (command) => command);
    const client = {
      ledger: { getEvents, replaceCashTransfer, voidCashTransfer } as never,
      cashDeposits: {} as never,
    };

    await replaceManualCashTransfer(
      {
        event: sourceEvent,
        amount: '1200',
        occurredAt: '2026-08-31T02:00:00.000Z',
        reason: '修正金额',
      },
      client,
    );
    await voidManualCashTransfer({ event: sourceEvent, reason: '重复录入' }, client);

    expect(replaceCashTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'REPLACE_CASH_TRANSFER',
        supersedesSourceEventId: sourceEvent.eventId,
        supersedesTargetEventId: targetEvent.eventId,
        expectedSourceLedgerRevision: '4',
        expectedTargetLedgerRevision: '8',
        reason: '修正金额',
      }),
    );
    expect(voidCashTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'VOID_CASH_TRANSFER',
        supersedesSourceEventId: sourceEvent.eventId,
        supersedesTargetEventId: targetEvent.eventId,
        reason: '重复录入',
      }),
    );
  });

  it('恢复划转会从两端审计链读取当前 VOID tip 并成对提交', async () => {
    const transferId = '55555555-5555-4555-8555-555555555555';
    const sourceFactId = '88888888-8888-4888-8888-888888888888';
    const targetFactId = '99999999-9999-4999-8999-999999999999';
    const sourceEvent = {
      version: 2,
      eventId: '66666666-6666-4666-8666-666666666666',
      factId: sourceFactId,
      accountId: cashAccount.id,
      type: 'CASH_FLOW',
      revisionAction: 'CREATE',
      ledgerRevision: '1',
      occurredAt: '2026-08-31T01:00:00.000Z',
      timePrecision: 'INSTANT',
      sourceTimezone: 'Asia/Shanghai',
      payload: {
        direction: 'OUTFLOW',
        category: 'TRANSFER',
        amount: '1000',
        currency: 'CNY',
        transfer: { transferId, counterpartyAccountId: securitiesAccount.id, leg: 'OUTFLOW' },
      },
    } as never;
    const targetEvent = {
      ...sourceEvent,
      eventId: '77777777-7777-4777-8777-777777777777',
      factId: targetFactId,
      accountId: securitiesAccount.id,
      payload: {
        ...sourceEvent.payload,
        direction: 'INFLOW',
        transfer: { transferId, counterpartyAccountId: cashAccount.id, leg: 'INFLOW' },
      },
    } as never;
    const sourceVoid = {
      ...sourceEvent,
      eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      revisionAction: 'VOID',
      ledgerRevision: '5',
      payload: undefined,
    } as never;
    const targetVoid = {
      ...targetEvent,
      eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      revisionAction: 'VOID',
      ledgerRevision: '9',
      payload: undefined,
    } as never;
    const getEvents = vi.fn(async (accountId: string) => ({
      events: [],
      ledgerRevision: accountId === cashAccount.id ? '5' : '9',
    }));
    const getEventAudit = vi.fn(async (accountId: string) => ({
      events:
        accountId === cashAccount.id ? [sourceEvent, sourceVoid] : [targetEvent, targetVoid],
      ledgerRevision: accountId === cashAccount.id ? '5' : '9',
    }));
    const restoreCashTransfer = vi.fn(async (command) => command);

    await restoreManualCashTransfer(
      { event: sourceEvent, reason: '撤销误作废' },
      {
        ledger: { getEvents, getEventAudit, restoreCashTransfer } as never,
        cashDeposits: {} as never,
      },
    );

    expect(restoreCashTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'RESTORE_CASH_TRANSFER',
        supersedesSourceEventId: sourceVoid.eventId,
        supersedesTargetEventId: targetVoid.eventId,
        expectedSourceLedgerRevision: '5',
        expectedTargetLedgerRevision: '9',
        reason: '撤销误作废',
      }),
    );
  });

  it('划转 Sheet 保留完整表单与底部提交区', () => {
    const source = readFileSync(
      new URL('../src/features/account-data/AccountDataCashTransferSheet.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('账户间现金划转');
    expect(source).toContain('当前账户方向');
    expect(source).toContain('对方账户');
    expect(source).toContain('金额（{account.currency}）');
    expect(source).toContain('<SheetFooter');
    expect(source).toContain('确认划转');
    expect(source).toContain('setError(');
    expect(source).toContain('onOpenChange(false)');
  });

  it('定期入账突出待确认实例，并把破坏性计划操作放进上下文菜单', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(cashDepositKeys.plans(cashAccount.id), [
      {
        id: '33333333-3333-4333-8333-333333333333',
        accountId: cashAccount.id,
        name: '工资入账',
        expectedAmount: '10000',
        currency: 'CNY',
        dayOfMonth: 31,
        timezone: 'Asia/Shanghai',
        startPeriod: '2026-08',
        status: 'ACTIVE',
        nextDueAt: '2026-09-30T01:00:00.000Z',
        version: 1,
        pausedAt: null,
        endedAt: null,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
    queryClient.setQueryData(cashDepositKeys.occurrences(cashAccount.id), [
      {
        id: '44444444-4444-4444-8444-444444444444',
        planId: '33333333-3333-4333-8333-333333333333',
        accountId: cashAccount.id,
        periodKey: '2026-08',
        planName: '工资入账',
        scheduledFor: '2026-08-31T01:00:00.000Z',
        expectedAmount: '10000',
        currency: 'CNY',
        status: 'PENDING',
        actualAmount: null,
        occurredAt: null,
        ledgerEventId: null,
        ledgerFactId: null,
        version: 1,
        skippedReason: null,
        confirmedAt: null,
        skippedAt: null,
        createdAt: '2026-08-31T01:00:00.000Z',
        updatedAt: '2026-08-31T01:00:00.000Z',
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        planId: '33333333-3333-4333-8333-333333333333',
        accountId: cashAccount.id,
        periodKey: '2026-07',
        planName: '工资入账',
        scheduledFor: '2026-07-31T01:00:00.000Z',
        expectedAmount: '10000',
        currency: 'CNY',
        status: 'CONFIRMED',
        actualAmount: '10050',
        occurredAt: '2026-07-31T02:00:00.000Z',
        ledgerEventId: '66666666-6666-4666-8666-666666666666',
        ledgerFactId: '77777777-7777-4777-8777-777777777777',
        version: 2,
        skippedReason: null,
        confirmedAt: '2026-07-31T02:01:00.000Z',
        skippedAt: null,
        createdAt: '2026-07-31T01:00:00.000Z',
        updatedAt: '2026-07-31T02:01:00.000Z',
      },
      {
        id: '88888888-8888-4888-8888-888888888888',
        planId: '33333333-3333-4333-8333-333333333333',
        accountId: cashAccount.id,
        periodKey: '2026-06',
        planName: '工资入账',
        scheduledFor: '2026-06-30T01:00:00.000Z',
        expectedAmount: '10000',
        currency: 'CNY',
        status: 'SKIPPED',
        actualAmount: null,
        occurredAt: null,
        ledgerEventId: null,
        ledgerFactId: null,
        version: 2,
        skippedReason: '本期未到账',
        confirmedAt: null,
        skippedAt: '2026-06-30T02:00:00.000Z',
        createdAt: '2026-06-30T01:00:00.000Z',
        updatedAt: '2026-06-30T02:00:00.000Z',
      },
    ]);
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <Toaster>
          <RecurringCashDeposits account={cashAccount} />
        </Toaster>
      </QueryClientProvider>,
    );
    const source = readFileSync(
      new URL('../src/features/account-data/AccountDataRecurringCashDeposits.tsx', import.meta.url),
      'utf8',
    );

    expect(markup).toContain('1 条待确认');
    expect(markup).toContain('已逾期');
    expect(markup).toContain('已确认历史');
    expect(markup).toContain('实际');
    expect(markup).toContain('10,050');
    expect(markup).toContain('这是应用内待办提醒');
    expect(markup).toContain('工资入账 · 2026-08');
    expect(markup).toContain('确认入账');
    expect(markup).toContain('恢复待确认');
    expect(markup).toContain('管理计划：工资入账');
    expect(source).toContain('variant="destructive"');
    expect(source).toContain('结束计划');
    expect(source).toContain('恢复待确认');
  });
});
