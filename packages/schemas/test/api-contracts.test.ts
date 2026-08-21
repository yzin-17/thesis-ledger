import { describe, expect, it } from 'vitest';
import {
  instrumentSearchResponseSchema,
  portfolioValuationResponseSchema,
  riskEventsResponseSchema,
} from '../src/index.js';

const accountId = '00000000-0000-4000-8000-000000000001';

describe('shared API contracts', () => {
  it('distinguishes cash zero from a missing cash field', () => {
    const value = {
      positions: [],
      cashValue: 0,
      cashByAccount: [{ accountId, amount: 0 }],
      totalCost: 0,
      totalMarketValue: 0,
      totalPnl: 0,
      partial: false,
      mode: 'actual',
      valuedAt: '2026-08-20T00:00:00.000Z',
    };
    expect(portfolioValuationResponseSchema.parse(value).cashValue).toBe(0);
    const missing = { ...value } as Record<string, unknown>;
    delete missing.cashValue;
    expect(portfolioValuationResponseSchema.safeParse(missing).success).toBe(false);
  });

  it('rejects malformed risk event lists instead of accepting partial DTOs', () => {
    expect(riskEventsResponseSchema.safeParse([{ id: 'event-only' }]).success).toBe(false);
  });

  it('keeps unsupported-market instruments searchable with confirmability metadata', () => {
    const result = instrumentSearchResponseSchema.parse([
      {
        id: '00000000-0000-4000-8000-000000000002',
        instrumentType: 'STOCK',
        market: 'HK',
        canonicalCode: '00700',
        displayName: '腾讯控股',
        symbol: '00700.HK',
        confirmable: false,
        disabledReason: '当前市场不支持建立 Portfolio Asset',
        generation: 1,
        active: true,
      },
    ]);
    expect(result[0]?.confirmable).toBe(false);
  });
});
