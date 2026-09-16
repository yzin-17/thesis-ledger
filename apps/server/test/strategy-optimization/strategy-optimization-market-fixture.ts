import { barSeriesV2Schema } from '@thesis-ledger/schemas';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import {
  MarketBarReader,
  PrismaMarketBarFactStore,
  barSeriesInputFingerprint,
} from '../../src/market/market-bar-reader.js';

/** 仅替代外部 Provider；风险服务、Reader 和 PostgreSQL 事实存储均使用真实实现。 */
export const createRiskMarketFixture = (prisma: PrismaService, symbol: string, suffix: string) => {
  const providerId = `postgres-e2e-${suffix}`;
  const reader = new MarketBarReader(
    {
      read: async () => ({
        revision: 1,
        targets: [{ providerId, upstreamSource: 'fixture', routeIndex: 0 }],
      }),
    },
    {
      read: async (input) => {
        if (input.identity.symbol !== symbol || input.identity.assetType !== 'STOCK' ||
          input.identity.timeframe !== '1d' || input.identity.adjustment !== 'none')
          throw new Error('PostgreSQL E2E 行情 fixture identity 不匹配');
        const points = [{
          timestamp: '2026-09-10T07:00:00.000Z',
          availableAt: '2026-09-10T08:01:00.000Z',
          open: 95, high: 96, low: 89, close: 90, volume: 1000, amount: 90000,
          completionStatus: 'complete' as const,
        }];
        return barSeriesV2Schema.parse({
          contractVersion: 2,
          identity: input.identity,
          points,
          coverage: {
            actualStart: points[0]!.timestamp,
            actualEnd: points[0]!.timestamp,
            hasMoreBefore: false,
            latestCompleteTradingDate: '2026-09-10',
          },
          provenance: {
            providerId, upstreamSource: 'fixture', routeIndex: 0, effectivePolicyRevision: 1,
            providerRevision: 'postgres-service-e2e-v2',
            fetchedAt: '2026-09-10T08:01:00.000Z', freshUntil: '2099-01-01T00:00:00.000Z',
            servedFromCache: false, cacheStatus: 'miss',
          },
          inputFingerprint: barSeriesInputFingerprint(input.identity, points),
        });
      },
    },
    new PrismaMarketBarFactStore(prisma),
  );
  return {
    reader,
    async cleanup() {
      await prisma.marketBarSeriesCoverage.deleteMany({ where: { providerId } });
      await prisma.marketBarSeriesFact.deleteMany({ where: { providerId } });
    },
  };
};
