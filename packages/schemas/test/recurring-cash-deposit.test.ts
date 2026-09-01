import { describe, expect, it } from 'vitest';
import {
  confirmRecurringCashDepositOccurrenceSchema,
  createRecurringCashDepositPlanSchema,
  recurringCashDepositOccurrenceSchema,
} from '../src/recurring-cash-deposit.js';

const accountId = '11111111-1111-4111-8111-111111111111';

describe('定期现金入账契约', () => {
  it('接受固定金额、月日和开始月份，并默认上海时区', () => {
    expect(
      createRecurringCashDepositPlanSchema.parse({
        accountId,
        name: '工资入账',
        expectedAmount: '10000.00',
        dayOfMonth: 31,
        startPeriod: '2026-08',
      }),
    ).toMatchObject({ timezone: 'Asia/Shanghai', dayOfMonth: 31 });
  });

  it('拒绝非法月份、月日和非正金额', () => {
    const input = {
      accountId,
      name: '工资入账',
      expectedAmount: '10000',
      dayOfMonth: 31,
      startPeriod: '2026-08',
    };
    expect(() => createRecurringCashDepositPlanSchema.parse({ ...input, dayOfMonth: 0 })).toThrow();
    expect(() => createRecurringCashDepositPlanSchema.parse({ ...input, dayOfMonth: 32 })).toThrow();
    expect(() => createRecurringCashDepositPlanSchema.parse({ ...input, expectedAmount: '0' })).toThrow();
    expect(() => createRecurringCashDepositPlanSchema.parse({ ...input, startPeriod: '2026-13' })).toThrow();
  });

  it('确认实例要求正的实际金额和 ISO 时间', () => {
    expect(
      confirmRecurringCashDepositOccurrenceSchema.parse({
        expectedVersion: 1,
        actualAmount: '9980.50',
        occurredAt: '2026-08-31T01:00:00.000Z',
      }),
    ).toMatchObject({ actualAmount: '9980.50' });
    expect(() =>
      confirmRecurringCashDepositOccurrenceSchema.parse({
        expectedVersion: 1,
        actualAmount: '0',
        occurredAt: '2026-08-31T01:00:00.000Z',
      }),
    ).toThrow();
  });

  it('实例状态与可选关联字段保持严格契约', () => {
    expect(() =>
      recurringCashDepositOccurrenceSchema.parse({
        id: accountId,
        planId: accountId,
        accountId,
        periodKey: '2026-08',
        planName: '工资入账',
        scheduledFor: '2026-08-31T01:00:00.000Z',
        expectedAmount: '10000',
        currency: 'CNY',
        status: 'WAITING',
      }),
    ).toThrow();
  });
});
