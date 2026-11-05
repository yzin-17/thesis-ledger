import { describe, expect, it } from 'vitest';
import {
  buildTransferCommand,
  type TransferFact,
  type TransferRead,
} from '../../src/features/cash-transfers/transfer-command';
import { emptyLedger, ledgerAccount } from './ledger-fixture';
const source = {
  ...ledgerAccount,
  mode: 'actual' as const,
  type: 'cash' as const,
  currency: 'CNY' as const,
};
const target = {
  ...source,
  type: 'fund' as const,
  id: '00000000-0000-4000-8000-000000000002',
  name: '受控转入账户',
};
const transferId = '00000000-0000-4000-8000-000000000003';
const time = '2026-10-23T01:00:00Z';
const from = {
  version: 3,
  eventId: '00000000-0000-4000-8000-000000000004',
  factId: '00000000-0000-4000-8000-000000000005',
  accountId: source.id,
  type: 'CASH_FLOW',
  revisionAction: 'CREATE',
  ledgerRevision: '8',
  occurredAt: time,
  timePrecision: 'INSTANT',
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'transfer',
  recordedAt: time,
  source: { category: 'MANUAL', channel: 'acceptance' },
  actorId: 'test',
  payload: {
    amount: '100',
    currency: 'CNY',
    category: 'TRANSFER',
    direction: 'OUTFLOW',
    transfer: { transferId, counterpartyAccountId: target.id, leg: 'OUTFLOW' },
  },
} as TransferFact;
const to = {
  ...from,
  accountId: target.id,
  eventId: '00000000-0000-4000-8000-000000000006',
  factId: '00000000-0000-4000-8000-000000000007',
  payload: {
    ...from.payload,
    direction: 'INFLOW',
    transfer: { transferId, counterpartyAccountId: source.id, leg: 'INFLOW' },
  },
} as TransferFact;
const read: TransferRead = {
  source: { ...emptyLedger, events: [from] },
  target: { ...emptyLedger, accountId: target.id, ledgerRevision: '12', events: [to] },
  sourceAudit: [from],
  targetAudit: [to],
};
const form = { amount: '100.12345678', occurredAt: time, note: '两端核对', reason: '更正金额' };
const context = { id: transferId, source, target, read };
describe('M08b 双边划转命令', () => {
  it('与服务端账户组合准入一致，不允许现金对现金或基金对证券', () => {
    expect(() =>
      buildTransferCommand(form, { ...context, target: { ...target, type: 'cash' } }),
    ).toThrow('现金账户与证券或基金');
    expect(() =>
      buildTransferCommand(form, { ...context, source: { ...source, type: 'securities' } }),
    ).toThrow('现金账户与证券或基金');
  });
  it('金额精度、两侧账户和账本版本保真，创建 ID 稳定', () => {
    const command = buildTransferCommand(form, context);
    expect(command).toMatchObject({
      amount: form.amount,
      sourceAccountId: source.id,
      targetAccountId: target.id,
      expectedSourceLedgerRevision: '7',
      expectedTargetLedgerRevision: '12',
    });
    expect(buildTransferCommand(form, context)).toEqual(command);
    expect(() => buildTransferCommand(form, { ...context, target: source })).toThrow();
    expect(() =>
      buildTransferCommand(form, { ...context, target: { ...target, currency: 'USD' } }),
    ).toThrow('币种');
    expect(() =>
      buildTransferCommand(form, { ...context, source: { ...source, mode: 'shadow' } }),
    ).toThrow('实际');
  });
  it('更正与作废必须同时找到两侧链顶，不接受单边数据', () => {
    const command = buildTransferCommand(form, { ...context, event: from, action: 'replace' });
    expect(command).toMatchObject({
      command: 'REPLACE_CASH_TRANSFER',
      supersedesSourceEventId: from.eventId,
      supersedesTargetEventId: to.eventId,
    });
    expect(() =>
      buildTransferCommand(form, {
        ...context,
        event: from,
        action: 'void',
        read: { ...read, targetAudit: [] },
      }),
    ).toThrow('完整');
  });
  it('恢复仅接受两端均作废，沿用两端作废事件 ID', () => {
    const sourceVoid = {
      ...from,
      eventId: crypto.randomUUID(),
      revisionAction: 'VOID' as const,
      supersedesEventId: from.eventId,
      reason: '作废',
      ledgerRevision: '9',
    };
    const targetVoid = {
      ...to,
      eventId: crypto.randomUUID(),
      revisionAction: 'VOID' as const,
      supersedesEventId: to.eventId,
      reason: '作废',
      ledgerRevision: '13',
    };
    const voidRead = { ...read, sourceAudit: [from, sourceVoid], targetAudit: [to, targetVoid] };
    const result = buildTransferCommand(form, {
      ...context,
      event: from,
      action: 'restore',
      read: voidRead,
    });
    expect(result).toMatchObject({
      command: 'RESTORE_CASH_TRANSFER',
      supersedesSourceEventId: sourceVoid.eventId,
      supersedesTargetEventId: targetVoid.eventId,
    });
    expect(() =>
      buildTransferCommand(form, {
        ...context,
        event: from,
        action: 'restore',
        read: { ...voidRead, targetAudit: [to] },
      }),
    ).toThrow('均已作废');
  });
});
