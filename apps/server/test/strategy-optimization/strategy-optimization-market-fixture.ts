import type { MarketBarReader } from '../../src/market/market-bar-reader.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';

/** 策略 PostgreSQL 用例只替代外部行情窗口；策略持久化与风险服务仍使用真实实现。 */
export const createRiskMarketFixture = (_prisma: PrismaService, symbol: string, suffix: string) => {
  const providerId = `postgres-e2e-${suffix}`;
  const reader = {
    readV3: async (input: { symbol: string; routeKey: { assetType: string; timeframe: string; adjustment: string } }) => {
      if (input.symbol !== symbol || input.routeKey.assetType !== 'STOCK' ||
        input.routeKey.timeframe !== '1d' || input.routeKey.adjustment !== 'none')
        throw new Error('PostgreSQL E2E 行情 fixture identity 不匹配');
      return {
        status: 'selected' as const,
        selection: {
          response: {
            bars: [{
              timestamp: '2026-09-10T07:00:00.000Z',
              availableAt: '2026-09-10T08:01:00.000Z',
              open: 95, high: 96, low: 89, close: 90, volume: 1000, amount: 90000,
              completionStatus: 'complete' as const,
            }],
            provenance: { providerId },
          },
        },
      };
    },
  } as unknown as MarketBarReader;
  return { reader, async cleanup() {} };
};
