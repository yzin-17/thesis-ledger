import { describe, expect, it, vi } from 'vitest';
import { assertExecutionCashAvailable } from '../../src/ledger/execution-cash-admission.js';
import {
  toLedgerEventV2,
  type AccountLedgerWriteContext,
} from '../../src/ledger/ledger-v2.repository.js';
import { cashFlowEvent, fixtureUuid, storedV2Event } from './ledger-event-fixtures.js';

const accountId = fixtureUuid('cash-admission-account');
const now = new Date('2026-11-05T10:00:00Z');
const at = '2026-11-05T08:00:00Z';
const funding = (amount: string, currency = 'CNY', settledAt?: string) =>
  cashFlowEvent({
    id: `fund-${currency}-${amount}`,
    accountId,
    amount,
    currency,
    occurredAt: '2025-01-01T00:00:00Z',
    ...(settledAt ? { settledAt } : {}),
  });
const execution = (id: string, amount = '100', extra: Record<string, unknown> = {}) =>
  storedV2Event({
    id,
    accountId,
    type: 'BUY_EXECUTION',
    occurredAt: at,
    ledgerRevision: 2n,
    payload: {
      symbol: '000001.OF',
      quantity: '1',
      price: amount,
      currency: 'CNY',
      capabilityVerification: 'UNVERIFIED',
      charges: [],
      ...extra,
    },
  });
const candidate = (amount = '100', extra: Record<string, unknown> = {}) =>
  toLedgerEventV2(execution('candidate', amount, extra) as never) as Parameters<
    typeof assertExecutionCashAvailable
  >[1];
const context = (events: unknown[]) =>
  ({
    accountId,
    currentLedgerRevision: 2n,
    transaction: { ledgerEvent: { findMany: vi.fn(async () => events) } },
  }) as unknown as AccountLedgerWriteContext;
const rejectCode = { response: { errorCode: 'LEDGER_INSUFFICIENT_CASH' } };

describe('成交写入现金准入', () => {
  it('本金和费用一起校验，刚好足额允许，失败不改已有数组', async () => {
    const desired = candidate('100', {
      charges: [{ category: 'COMMISSION', amount: '1', currency: 'CNY' }],
    });
    for (const amount of ['60', '100']) {
      const events = [funding(amount)];
      await expect(
        assertExecutionCashAvailable(context(events), desired, now),
      ).rejects.toMatchObject(rejectCode);
      expect(events).toHaveLength(1);
    }
    await expect(
      assertExecutionCashAvailable(context([funding('101')]), desired, now),
    ).resolves.toBeUndefined();
  });
  it('待收款不充当可用资金，已有待付款占用不能重复花费', async () => {
    await expect(
      assertExecutionCashAvailable(
        context([funding('1000', 'CNY', '2026-11-06T08:00:00Z')]),
        candidate(),
        now,
      ),
    ).rejects.toMatchObject(rejectCode);
    const pending = execution('pending', '20', { settledAt: '2026-11-06T08:00:00Z' });
    await expect(
      assertExecutionCashAvailable(context([funding('120'), pending]), candidate('101'), now),
    ).rejects.toMatchObject(rejectCode);
  });
  it('按费用币种独立校验，不使用另一币种余额替代', async () => {
    const desired = candidate('100', {
      charges: [{ category: 'COMMISSION', amount: '1', currency: 'USD' }],
    });
    await expect(
      assertExecutionCashAvailable(context([funding('1000')]), desired, now),
    ).rejects.toMatchObject(rejectCode);
    await expect(
      assertExecutionCashAvailable(context([funding('100'), funding('1', 'USD')]), desired, now),
    ).resolves.toBeUndefined();
  });
  it('更正只计算同一事实净差额，历史负余额可以改善但不能恶化', async () => {
    const old = execution('old');
    const desired = {
      ...candidate('101'),
      factId: old.factId!,
      revisionAction: 'REPLACE' as const,
      supersedesEventId: old.id,
      reason: '调整成交费用',
      ledgerRevision: '3',
    };
    await expect(
      assertExecutionCashAvailable(context([funding('101'), old]), desired, now),
    ).resolves.toBeUndefined();
    await expect(
      assertExecutionCashAvailable(
        context([funding('60'), old]),
        { ...desired, payload: { ...desired.payload, price: '90' } },
        now,
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertExecutionCashAvailable(
        context([funding('60'), old]),
        { ...desired, payload: { ...desired.payload, price: '120' } },
        now,
      ),
    ).rejects.toMatchObject(rejectCode);
  });
  it('未来到账不能为过去成交补足资金，卖出净费用同样受约束', async () => {
    const past = { ...candidate(), occurredAt: '2026-11-04T08:00:00Z' };
    await expect(
      assertExecutionCashAvailable(
        context([funding('1000', 'CNY', '2026-11-05T08:00:00Z')]),
        past,
        now,
      ),
    ).rejects.toMatchObject(rejectCode);
    const sale = {
      ...candidate('20', { charges: [{ category: 'COMMISSION', amount: '21', currency: 'CNY' }] }),
      type: 'SELL_EXECUTION' as const,
    };
    await expect(assertExecutionCashAvailable(context([]), sale, now)).rejects.toMatchObject(
      rejectCode,
    );
  });
});
