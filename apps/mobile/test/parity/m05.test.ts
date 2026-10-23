import { describe, it, expect } from 'vitest';
import {
  buildExecutionCommand,
  executionForm,
} from '../../src/features/executions/execution-command';
const context = {
  id: 'mobile-command-1',
  accountId: '00000000-0000-4000-8000-000000000001',
  revision: '9',
};
const form = {
  ...executionForm(undefined, 'CNY'),
  symbol: '510300.SH',
  quantity: '100',
  price: '3.12345678',
  occurredAt: '2026-10-22',
  timePrecision: 'DATE' as const,
  sourceTimezone: 'Asia/Shanghai',
};
describe('手机成交命令', () => {
  it('十进制、日期精度、来源身份与可选费用保真', () => {
    const result = buildExecutionCommand(form, context);
    expect(result.payload.price).toBe('3.12345678');
    expect(result.occurredAt).toBe('2026-10-22');
    expect(result.source.externalId).toBe('mobile-command-1');
    expect(buildExecutionCommand(form, context)).toEqual(result);
    expect(() => buildExecutionCommand({ ...form, quantity: '-1' }, context)).toThrow();
    expect(() => buildExecutionCommand({ ...form, timePrecision: 'INSTANT' }, context)).toThrow();
  });
  it('更正/恢复必须保留打开时版本、目标事件与原因', () => {
    expect(() => buildExecutionCommand(form, { ...context, action: 'replace' })).toThrow();
    const result = buildExecutionCommand(
      { ...form, reason: '人工核对回单' },
      { ...context, action: 'restore', supersedesEventId: '00000000-0000-4000-8000-000000000002' },
    );
    expect(result).toMatchObject({
      command: 'RESTORE_EXECUTION',
      expectedLedgerRevision: '9',
      reason: '人工核对回单',
    });
  });
  it('带时区偏移的输入转换为同一 UTC 时刻并保留来源时区', () => {
    const result = buildExecutionCommand(
      {
        ...form,
        timePrecision: 'INSTANT',
        occurredAt: '2026-10-22T15:00:00+08:00',
        settledAt: '2026-10-23T15:00:00+08:00',
      },
      context,
    );
    expect(result.occurredAt).toBe('2026-10-22T07:00:00.000Z');
    expect(result.sourceTimezone).toBe('Asia/Shanghai');
    expect(result.payload.settledAt).toBe('2026-10-23T07:00:00.000Z');
    for (const occurredAt of [
      '2026-02-30T15:00:00+08:00',
      '2026-10-22T15:00:00',
      '2026-10-22T24:00:00Z',
    ]) {
      expect(() =>
        buildExecutionCommand({ ...form, timePrecision: 'INSTANT', occurredAt }, context),
      ).toThrow();
    }
  });
});
