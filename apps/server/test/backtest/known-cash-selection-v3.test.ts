import { describe, expect, it } from 'vitest';
import { knownCashPreparedFixture } from './known-cash-test-fixtures.js';
import { knownCashRecordAdoptedV3 } from '../../src/backtest/backtest-known-cash-selection-v3.js';
import { knownCashDisclosureV3 } from '../../src/backtest/backtest-known-cash-disclosure-v3.js';
import type { RunConfigV3 } from '@thesis-ledger/schemas';

describe('冻结的通用现金记录选择', () => {
  it('新默认排除未知，事件核对/明确语义或显式假设才能采用；旧输入保持', async () => {
    const prepared = await knownCashPreparedFixture();
    const record = {
      ...prepared.input.records[0]!,
      planStatus: 'unknown' as const,
      statusBasis: 'unverified' as const,
      sourceStatus: '2',
      normalizedStatus: 'unknown' as const,
      issues: ['UNKNOWN_DIVIDEND_STATUS'],
    };
    expect(knownCashRecordAdoptedV3(prepared.input.policy, record)).toBe(true);
    const policy = { ...prepared.input.policy, uncertainRecords: 'exclude' as const };
    expect(knownCashRecordAdoptedV3(policy, record)).toBe(false);
    expect(
      knownCashRecordAdoptedV3({ ...policy, uncertainRecords: 'assume-scheduled' }, record),
    ).toBe(true);
    expect(knownCashRecordAdoptedV3(policy, { ...record, statusBasis: 'event-reconciled' })).toBe(
      true,
    );
    expect(knownCashRecordAdoptedV3(policy, { ...record, statusBasis: 'source-defined' })).toBe(
      true,
    );
    prepared.input.records = [record];
    prepared.input.policy = policy;
    const disclosure = knownCashDisclosureV3(
      { knownCashPreparation: prepared } as RunConfigV3,
      { actions: [], ledger: [] } as never,
    );
    if (!disclosure) throw new Error('测试缺少现金披露');
    expect(disclosure.records[0]).toMatchObject({
      status: 'not-adopted',
      eligibleQuantity: null,
      grossCashAmount: null,
    });
    expect(disclosure.coverage.complete).toBe(false);
  });
});
