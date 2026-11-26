import { vi } from 'vitest';
import { fundHoldingsSchema, fundNavSchema } from '@thesis-ledger/schemas';
import { controlledMarketSession } from './market-session.fixture.js';

export const at = new Date('2026-11-04T06:00:00Z');
export const fixture = (options: { quoteAt?: string; basisAt?: string; stale?: boolean; missingDay?: boolean; disclosure?: string; futureNav?: boolean } = {}) => {
  const getQuote = vi.fn(async () => ({
    symbol: '600519.SH', price: 110, marketTime: options.quoteAt ?? at.toISOString(),
    stale: options.stale ?? false, freshness: 'live',
  }));
  const readChartV3 = vi.fn(async () => ({
    identity: { symbol: '600519.SH', assetType: 'STOCK', timeframe: '1d', adjustment: 'qfq' },
    points: (options.missingDay ? ['2026-11-03'] : ['2026-11-03', '2026-11-04']).map((day, index) => ({
      timestamp: day + 'T00:00:00Z', close: index === 0 ? 100 : 110,
      availableAt: at.toISOString(), completionStatus: index === 0 ? 'complete' : 'incomplete',
    })),
    provenance: { fetchedAt: at.toISOString() },
    chartContextV3: { sourcePriceBasis: { adjustment: 'qfq', observedAt: options.basisAt ?? at.toISOString() } },
  }));
  return {
    getQuote, readChartV3,
    input: {
      symbol: '000001.OF', at, current: true,
      bars: { readChartV3 } as never,
      market: {
        getSession: controlledMarketSession,
        getQuote,
        getFundNav: async () => fundNavSchema.parse({
          version: 1, symbol: '000001.OF', unitNav: 1,
          navDate: options.futureNav ? '2026-11-05T00:00:00Z' : '2026-11-03T00:00:00Z',
          provider: 'fixture', fetchedAt: at.toISOString(), freshness: 'delayed',
        }),
        getFundHoldings: async () => fundHoldingsSchema.parse({
          version: 1, fundSymbol: '000001.OF', reportPeriod: '2026-Q3',
          disclosureDate: options.disclosure ?? '2026-10-30T00:00:00Z',
          provider: 'fixture', fetchedAt: at.toISOString(), evidenceVersion: 'fixture',
          holdings: [{ symbol: '600519.SH', name: '受控持仓', weight: 0.25 }],
        }),
      } as never,
    },
  };
};

