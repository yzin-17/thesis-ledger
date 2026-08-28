import { describe, expect, it, vi } from 'vitest';

import {
  confirmBaselineReconciliation,
  createExecution,
  fetchAccountLedgerAudit,
  fetchAccountLedgerEvents,
  fetchReconciliationCandidates,
  replaceExecution,
  restoreExecution,
  voidExecution,
} from '../src/features/account-data/account-data.api.js';
import { accountDataKeys } from '../src/features/account-data/account-data.queries.js';
import type {
  ConfirmBaselineReconciliationCommandV2,
  ReplaceExecutionCommandV2,
  RestoreExecutionCommandV2,
  VoidExecutionCommandV2,
} from '@thesis-ledger/api-client';

const response = {
  accountId: 'account-1',
  ledgerRevision: '4',
  projectionGeneration: '7',
  events: [],
  effective: true as const,
};

describe('账户数据查询与命令边界', () => {
  it('把账户上下文纳入事件、审计和对账 query key', () => {
    expect(accountDataKeys.events('account-1', 'actual', 'executions')).toEqual([
      'desktop',
      'account-data',
      'events',
      'account-1',
      'actual',
      'executions',
    ]);
    expect(accountDataKeys.events('account-1', 'shadow', 'other')).not.toEqual(
      accountDataKeys.events('account-1', 'actual', 'other'),
    );
    expect(accountDataKeys.audit('account-1', 'actual')).not.toEqual(
      accountDataKeys.audit('account-2', 'actual'),
    );
    expect(accountDataKeys.reconciliation('account-1', 'actual')).toContain('reconciliation');
  });

  it('通过专用客户端读取当前有效事件、审计和对账候选', async () => {
    const client = {
      getEvents: vi.fn().mockResolvedValue(response),
      getEventAudit: vi.fn().mockResolvedValue({
        accountId: 'account-1',
        asOfLedgerRevision: '4',
        ledgerRevision: '4',
        projectionGeneration: '7',
        events: [],
        effective: false as const,
      }),
      getReconciliationCandidates: vi.fn().mockResolvedValue({
        accountId: 'account-1',
        ruleVersion: 1 as const,
        checkpoints: [],
        candidates: [],
      }),
    };

    await expect(fetchAccountLedgerEvents('account-1', client)).resolves.toBe(response);
    await expect(fetchAccountLedgerAudit('account-1', client)).resolves.toMatchObject({
      accountId: 'account-1',
    });
    await expect(fetchReconciliationCandidates('account-1', client)).resolves.toMatchObject({
      accountId: 'account-1',
    });
    expect(client.getEvents).toHaveBeenCalledWith('account-1');
    expect(client.getEventAudit).toHaveBeenCalledWith('account-1');
    expect(client.getReconciliationCandidates).toHaveBeenCalledWith('account-1');
  });

  it('把成交写入委托给专用 createExecution command', async () => {
    const create = vi.fn().mockResolvedValue({
      eventIds: ['00000000-0000-4000-8000-000000000001'],
      factIds: ['00000000-0000-4000-8000-000000000002'],
      ledgerRevisions: {},
      projectionGenerations: {},
      affectedSymbols: ['600519.SH'],
      idempotentReplay: false,
    });
    const command = {
      command: 'CREATE_EXECUTION' as const,
      accountId: '00000000-0000-4000-8000-000000000003',
      occurredAt: '2026-08-28T09:30:00.000Z',
      timePrecision: 'INSTANT' as const,
      sourceTimezone: 'Asia/Shanghai',
      economicOrderKey: 'client-command-1',
      side: 'BUY' as const,
      payload: {
        symbol: '600519.SH',
        quantity: '1',
        price: '1450.1234',
        currency: 'CNY',
        capabilityVerification: 'UNVERIFIED' as const,
        charges: [],
      },
      source: {
        category: 'MANUAL' as const,
        channel: 'desktop-account-data',
        externalId: 'client-command-1',
      },
      actorId: 'desktop-user',
    };

    await expect(createExecution(command, { createExecution: create })).resolves.toMatchObject({
      idempotentReplay: false,
    });
    expect(create).toHaveBeenCalledWith(command);
  });

  it('把更正、作废、恢复和对账确认委托给专用 command', async () => {
    const replace = vi.fn().mockResolvedValue({});
    const voidCommand = vi.fn().mockResolvedValue({});
    const restore = vi.fn().mockResolvedValue({});
    const confirm = vi.fn().mockResolvedValue({});
    const replaceInput = {} as ReplaceExecutionCommandV2;
    const voidInput = {} as VoidExecutionCommandV2;
    const restoreInput = {} as RestoreExecutionCommandV2;
    const confirmInput = {} as ConfirmBaselineReconciliationCommandV2;

    await replaceExecution(replaceInput, { replaceExecution: replace });
    await voidExecution(voidInput, { voidExecution: voidCommand });
    await restoreExecution(restoreInput, { restoreExecution: restore });
    await confirmBaselineReconciliation(confirmInput, {
      confirmBaselineReconciliation: confirm,
    });

    expect(replace).toHaveBeenCalledWith(replaceInput);
    expect(voidCommand).toHaveBeenCalledWith(voidInput);
    expect(restore).toHaveBeenCalledWith(restoreInput);
    expect(confirm).toHaveBeenCalledWith(confirmInput);
  });
});
