import { expect, it, vi } from 'vitest';
import { FundDailyErrorService } from '../../src/market/fund-daily-error.service.js';
import { controlledMarketSession } from './market-session.fixture.js';

it.each(['ready', 'disabled', 'revision', 'ineligible', 'provider', 'upstream'] as const)(
  '净值误差仅消费精确公开来源，资格=%s',
  async (admission) => {
    const day = '2026-11-06',
      symbol = '000001.OF';
    const now = new Date(day + 'T13:45:00Z');
    const key = { kind: 'data', market: 'CN', assetType: 'MUTUAL_FUND', capability: 'FUND_NAV' };
    const target = {
      eligible: admission !== 'ineligible',
      providerId: admission === 'provider' ? 'other' : 'akshare',
      upstreamSource: admission === 'upstream' ? 'other' : 'eastmoney',
    };
    const estimate = {
      version: 1,
      symbol,
      marketState: 'open',
      quality: 'partial',
      estimatedNav: 1.01,
      changePercent: 1,
      estimatedAt: day + 'T06:59:00Z',
      oldestPriceAt: day + 'T06:59:00Z',
      anchor: { unitNav: 1, navDate: '2026-11-05T00:00:00Z' },
      disclosureCoverage: 0.8,
      pricedCoverage: 0.8,
      reasons: ['partial_coverage'],
      method: 'disclosed-holdings-qfq-v1',
    };
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      fundDailyEstimateError: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { symbol, day, method: estimate.method, estimate, sourceAttemptAt: null },
          ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const nav = {
      version: 3,
      symbol,
      unitNav: 0.978,
      navDate: day + 'T00:00:00Z',
      provider: 'akshare',
      fetchedAt: day + 'T13:32:00Z',
      freshness: 'delayed',
      fallbackUsed: false,
    };
    const mget = vi.fn().mockResolvedValue([JSON.stringify(nav), null]);
    const dsa = {
      marketCacheContextV3: vi
        .fn()
        .mockResolvedValue({
          ready: true,
          routeKey: key,
          generation: 'a'.repeat(64),
          policyRevision: 188,
        }),
      effectiveControlPolicyV3: vi.fn().mockResolvedValue({
        projection: {
          effective: {
            revision: admission === 'revision' ? 189 : 188,
            enabled: admission !== 'disabled',
            routes: [{ key, targets: [target] }],
          },
        },
      }),
      get: vi.fn(),
    };
    await new FundDailyErrorService(
      db as never,
      { client: { mget } } as never,
      dsa as never,
      { read: controlledMarketSession } as never,
    ).run(now);
    expect(db.fundDailyEstimateError.updateMany.mock.calls[0]?.[0]).toMatchObject({
      data: { checkedAt: now },
    });
    expect(dsa.get).not.toHaveBeenCalled();
    if (admission === 'ready') {
      expect(mget).toHaveBeenCalledOnce();
      expect(db.fundDailyEstimateError.updateMany).toHaveBeenCalledTimes(2);
      expect(db.fundDailyEstimateError.updateMany.mock.calls[1]?.[0]).toMatchObject({
        data: {
          errors: { signed: '0.032', absolute: '0.032' },
          official: {
            servedFromCache: true,
            upstreamSource: 'eastmoney',
            policyRevision: 188,
            generation: 'a'.repeat(64),
          },
        },
      });
    } else {
      expect(mget).not.toHaveBeenCalled();
      expect(db.fundDailyEstimateError.updateMany).toHaveBeenCalledOnce();
    }
  },
);
