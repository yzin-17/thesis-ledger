import { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { assertIsolated, databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { FundDailyErrorService } from '../../src/market/fund-daily-error.service.js';
import { FundValuationPointRepository } from '../../src/market/fund-valuation-point.repository.js';
import type { FundValuation } from '@thesis-ledger/schemas';
describe.skipIf(!databaseUrl)('单基金每日误差持久化', () => {
  it('冻结实际最后有效分钟，错误日期继续等待；晚到缓存收敛，抢占失败不重复读取', async () => {
    const db = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    await assertIsolated(db);
    const repo = new FundValuationPointRepository(db as never),
      symbol = '000001.OF',
      day = '2026-11-06';
    const last = new Date(day + 'T06:59:00Z'),
      anchor = { unitNav: 1, navDate: '2026-11-05T00:00:00Z' };
    const value: FundValuation = {
      version: 1,
      symbol,
      marketState: 'open',
      quality: 'low_coverage',
      estimatedNav: 0.9905325019837131,
      estimatedAt: last.toISOString(),
      oldestPriceAt: last.toISOString(),
      changePercent: -0.94,
      anchor,
      disclosureCoverage: 0.3993,
      pricedCoverage: 0.3993,
      reasons: ['low_coverage'],
      method: 'disclosed-holdings-qfq-v1',
    };
    const evidence = {
      symbol,
      estimatedNav: value.estimatedNav,
      pricedCoverage: 0.3993,
      disclosureCoverage: 0.3993,
      disclosureAvailableAt: '2026-10-30T00:00:00Z',
      holdingPrices: [
        {
          symbol: '600519.SH',
          status: 'available',
          quoteTradingDate: day,
          quoteMarketTime: last.toISOString(),
          inputFingerprint: 'fixed',
          anchorDate: '2026-11-05',
          anchorAdjustedClose: 100,
          currentAdjustedClose: 99,
          sourcePriceBasis: { adjustment: 'qfq' },
        },
      ],
    };
    const key = { kind: 'data', market: 'CN', assetType: 'MUTUAL_FUND', capability: 'FUND_NAV' };
    const nav = {
      version: 3,
      symbol,
      unitNav: 0.978,
      provider: 'akshare',
      navDate: day + 'T00:00:00Z',
      fetchedAt: day + 'T13:32:00Z',
      freshness: 'delayed',
      fallbackUsed: false,
    };
    const dsa = {
      marketCacheContextV3: async () => ({
        ready: true,
        routeKey: key,
        generation: 'a'.repeat(64),
        policyRevision: 188,
      }),
      effectiveControlPolicyV3: async () => ({
        projection: {
          effective: {
            revision: 188,
            enabled: true,
            routes: [
              {
                key,
                targets: [{ eligible: true, providerId: 'akshare', upstreamSource: 'eastmoney' }],
              },
            ],
          },
        },
      }),
      get: vi.fn(async () => ({ ...nav, navDate: '2026-11-05T00:00:00Z' })),
    };
    const mget = vi.fn(async (): Promise<(string | null)[]> => [null, null]);
    const worker = () =>
      new FundDailyErrorService(db as never, { client: { mget } } as never, dsa as never);
    try {
      await repo.record(value, last, evidence);
      const unavailable: FundValuation = {
        ...value,
        quality: 'unavailable',
        estimatedAt: null,
        estimatedNav: null,
        changePercent: null,
        oldestPriceAt: null,
        reasons: ['prices_unavailable'],
      };
      await repo.record(unavailable, new Date(last.getTime() + 30000), { reason: 'unavailable' });
      await worker().run(new Date(day + 'T06:59:45Z'));
      expect(await worker().latest(symbol)).toBeNull();
      const after = new Date(day + 'T13:45:00Z');
      await Promise.all([worker().run(after), worker().run(after)]);
      expect(dsa.get).toHaveBeenCalledTimes(1);
      expect(await worker().latest(symbol)).toMatchObject({
        day,
        pricedCoverage: 0.3993,
        errors: null,
      });
      mget.mockResolvedValue([null, JSON.stringify(nav)]);
      await worker().run(after);
      expect(await worker().latest(symbol)).toMatchObject({
        official: { servedFromCache: true, navDate: nav.navDate },
        errors: { signed: '0.0125325019837131', absolute: '0.0125325019837131' },
      });
      await worker().run(after);
      expect(dsa.get).toHaveBeenCalledTimes(1);
    } finally {
      await db.$disconnect();
    }
  });
});
