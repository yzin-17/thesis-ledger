import { describe, expect, it } from 'vitest';
import {
  confirmRecurringFundInvestmentOccurrenceSchema,
  createRecurringFundInvestmentPlanSchema,
} from '../src/recurring-fund-investment.js';

describe('基金定投 Schema', () => {
  it('只接受真实场外基金代码所需的规范计划字段', () => {
    const input = {
      accountId: '00000000-0000-4000-8000-000000000001',
      name: '沪深300定投',
      symbol: '000300.of',
      expectedAmount: '1000',
      dayOfMonth: 31,
      startPeriod: '2026-09',
    };
    expect(createRecurringFundInvestmentPlanSchema.parse(input).symbol).toBe('000300.OF');
    expect(() =>
      createRecurringFundInvestmentPlanSchema.parse({ ...input, symbol: '510300.SH' }),
    ).toThrow();
    expect(() =>
      createRecurringFundInvestmentPlanSchema.parse({ ...input, expectedAmount: '0' }),
    ).toThrow();
  });

  it('确认成交要求实际份额、净值和日期', () => {
    const input = {
      expectedVersion: 1,
      actualQuantity: '812.3456',
      unitPrice: '1.23',
      commission: '1.5',
      occurredAt: '2026-09-08',
    };
    expect(confirmRecurringFundInvestmentOccurrenceSchema.parse(input)).toEqual(input);
    expect(() =>
      confirmRecurringFundInvestmentOccurrenceSchema.parse({ ...input, actualQuantity: '0' }),
    ).toThrow();
    expect(() =>
      confirmRecurringFundInvestmentOccurrenceSchema.parse({
        ...input,
        occurredAt: '2026-09-08T01:00:00Z',
      }),
    ).toThrow();
  });
});
