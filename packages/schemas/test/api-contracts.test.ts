import { describe, expect, it } from 'vitest';
import {
  automationCloseSyncInputSchema,
  instrumentSearchResponseSchema,
  ledgerAuditResponseSchema,
  ledgerEventsResponseSchema,
  portfolioValuationResponseSchema,
  riskEventsResponseSchema,
  tradeListResponseSchema,
} from '../src/index.js';

const accountId = '00000000-0000-4000-8000-000000000001';

describe('shared API contracts', () => {
  it('收盘同步需要明确日期且只接收日线周期', () => {
    const base = { symbols: ['600519.SH'], end: '2026-09-11T08:00:00.000Z' };
    expect(automationCloseSyncInputSchema.safeParse(base).success).toBe(true);
    expect(automationCloseSyncInputSchema.safeParse({ symbols: base.symbols }).success).toBe(false);
    expect(automationCloseSyncInputSchema.safeParse({ ...base, timeframe: '1m' }).success).toBe(false);
  });
  it('distinguishes cash zero from a missing cash field', () => {
    const value = {
      positions: [],
      cashValue: 0,
      cashByAccount: [{ accountId, amount: 0 }],
      totalCost: 0,
      totalMarketValue: 0,
      totalPnl: 0,
      unrealizedPnl: 0,
      unrealizedPnlRatio: null,
      realizedPnl: 0,
      realizedPnlRatio: null,
      cumulativePnl: 0,
      cumulativePnlRatio: null,
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
      unrealizedPnl: 0,
      unrealizedPnlRatio: null,
      realizedPnl: 0,
      realizedPnlRatio: null,
      cumulativePnl: 0,
      cumulativePnlRatio: null,
      partial: false,
      mode: 'actual',
      baseCurrency: 'CNY',
      fx: {
        version: 3,
        evidenceVersion: 'fx-v3|CNY|2026-08-20|HKD: CNY',
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
      fx: { evidenceVersion: expect.stringContaining('fx-v3') },
    });
  });

  it('保留持仓和组合的每日变化口径', () => {
    const result = portfolioValuationResponseSchema.parse({
      positions: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          accountId,
          symbol: '600519.SH',
          quantity: 10,
          costPrice: 100,
          marketPrice: 110,
          previousClose: 108,
          marketValue: 1100,
          costValue: 1000,
          pnl: 100,
          pnlRatio: 0.1,
          dailyPnl: 20,
          dailyReturn: 0.0185185185,
          baseDailyPnl: 20,
          stale: false,
        },
      ],
      cashValue: 0,
      cashByAccount: [{ accountId, amount: 0 }],
      totalCost: 1000,
      totalMarketValue: 1100,
      totalPnl: 100,
      unrealizedPnl: 100,
      unrealizedPnlRatio: 0.1,
      realizedPnl: 0,
      realizedPnlRatio: null,
      cumulativePnl: 100,
      cumulativePnlRatio: 0.1,
      dailyChange: {
        pnl: 20,
        returnRate: 0.0185185185,
        partial: false,
        missingSymbols: [],
        basis: 'PREVIOUS_CLOSE_CURRENT_HOLDINGS',
      },
      partial: false,
      mode: 'actual',
      valuedAt: '2026-09-09T00:00:00.000Z',
    });

    expect(result.positions[0]).toMatchObject({ previousClose: 108, dailyPnl: 20 });
    expect(result.dailyChange).toMatchObject({
      pnl: 20,
      returnRate: 0.0185185185,
      partial: false,
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
      ledgerEventsResponseSchema.parse({
        accountId,
        ledgerRevision: '0',
        projectionGeneration: '0',
        events: [],
        instrumentDirectory: { generation: 0, items: [], unresolvedSymbols: [] },
        effective: true,
      }),
    ).toMatchObject({ ledgerRevision: '0', projectionGeneration: '0' });

    const trade = {
      id: 'trade:trade-projection-v1:account:symbol:fact',
      accountId,
      accountMode: 'actual',
      symbol: '600519.SH',
      assetName: '贵州茅台',
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
      tradeListResponseSchema.parse({
        accountId,
        mode: 'actual',
        items: [trade],
        nextCursor: null,
        projectionGenerations: { [accountId]: '2' },
      }).items[0],
    ).toMatchObject({ assetName: '贵州茅台', remainingQuantity: '100' });
    expect(
      tradeListResponseSchema.safeParse({
        accountId,
        mode: 'actual',
        items: [{ ...trade, remainingQuantity: 100 }],
        nextCursor: null,
        projectionGenerations: { [accountId]: '2' },
      }).success,
    ).toBe(false);
  });

  it('审计响应拒绝旧事件信封', () => {
    const oldEvent = {
      version: 1,
      id: '00000000-0000-4000-8000-000000000002',
      accountId,
      type: 'BUY',
      occurredAt: null,
      symbol: null,
      quantity: null,
      price: null,
      amount: null,
      fee: null,
      tax: null,
      externalId: null,
      source: 'migration',
      sourceRowId: null,
      currency: 'CNY',
      note: null,
      metadata: null,
      createdAt: '2026-08-20T00:00:00.000Z',
    };
    expect(
      ledgerAuditResponseSchema.safeParse({
        accountId,
        asOfLedgerRevision: '1',
        ledgerRevision: '1',
        projectionGeneration: '1',
        events: [oldEvent],
        instrumentDirectory: { generation: 0, items: [], unresolvedSymbols: [] },
        effective: false,
      }).success,
    ).toBe(false);
  });
});
