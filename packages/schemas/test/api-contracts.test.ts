import { describe, expect, it } from 'vitest';
import {
  instrumentSearchResponseSchema,
  ledgerEventsResponseSchemaV2,
  portfolioValuationResponseSchema,
  riskEventsResponseSchema,
  tradeListResponseSchemaV2,
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

  it('保留多币种现金与 FX 来源版本证据', () => {
    const result = portfolioValuationResponseSchema.parse({
      positions: [],
      cashValue: 92,
      cashByAccount: [{ accountId, amount: 92, currency: 'CNY', nativeCurrency: 'HKD' }],
      cashByCurrency: [{ currency: 'HKD', amount: 100, convertedAmount: 92 }],
      totalCost: 0,
      totalMarketValue: 92,
      totalPnl: 0,
      partial: false,
      mode: 'actual',
      baseCurrency: 'CNY',
      fx: {
        version: 1,
        evidenceVersion: 'fx-v1|CNY|2026-08-20|HKD: CNY',
        enabled: true,
        status: 'ready',
        baseCurrency: 'CNY',
        asOf: '2026-08-20',
        fxAsOf: '2026-08-20',
        conversionMode: 'current-rate',
        missingCurrencies: [],
        rates: [
          {
            fromCurrency: 'HKD',
            toCurrency: 'CNY',
            rate: 0.92,
            rateDate: '2026-08-20',
            provider: 'fixture',
            fetchedAt: '2026-08-20T00:00:00.000Z',
            freshness: 'live',
            stale: false,
            ageDays: 0,
            available: true,
          },
        ],
      },
      dataQuality: { partial: false, missingSymbols: [], missingCurrencies: [] },
      valuedAt: '2026-08-20T00:00:00.000Z',
    });
    expect(result).toMatchObject({
      baseCurrency: 'CNY',
      fx: { evidenceVersion: expect.stringContaining('fx-v1') },
    });
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

  it('为 Ledger 和 Trade 读取接口固定 Revision、世代和十进制字符串', () => {
    expect(
      ledgerEventsResponseSchemaV2.parse({
        accountId,
        ledgerRevision: '0',
        projectionGeneration: '0',
        events: [],
        effective: true,
      }),
    ).toMatchObject({ ledgerRevision: '0', projectionGeneration: '0' });

    const trade = {
      id: 'trade:trade-projection-v1:account:symbol:fact',
      accountId,
      accountMode: 'actual',
      symbol: '600519.SH',
      lifecycle: 'ACTIVE',
      exitProgress: 'NONE',
      endEvidence: 'UNKNOWN',
      openedAt: null,
      closedAt: null,
      earliestEvidenceAt: '2026-08-20T00:00:00.000Z',
      sourceQuantity: '100',
      closedQuantity: '0',
      remainingQuantity: '100',
      grossRealizedPnl: null,
      netRealizedPnl: null,
      realizedNetReturnRate: null,
      costEstimated: false,
      completeness: 'COMPLETE',
      issues: [],
      costIssues: [],
      algorithmVersion: 'trade-projection-v1',
      projectionFingerprint: null,
      projectionGeneration: '2',
      excludedReasons: ['LIFECYCLE_ACTIVE'],
    };
    expect(
      tradeListResponseSchemaV2.parse({
        accountId,
        mode: 'actual',
        items: [trade],
        nextCursor: null,
        projectionGenerations: { [accountId]: '2' },
      }).items[0]?.remainingQuantity,
    ).toBe('100');
    expect(
      tradeListResponseSchemaV2.safeParse({
        accountId,
        mode: 'actual',
        items: [{ ...trade, remainingQuantity: 100 }],
        nextCursor: null,
        projectionGenerations: { [accountId]: '2' },
      }).success,
    ).toBe(false);
  });
});
