import { vi } from 'vitest';
import { MarketService } from '../../src/market/market.service.js';
import type { DataQualityService } from '../../src/quality/data-quality.service.js';
import { quoteControlFixture } from '../market/quote-control-fixture.js';

export const quoteFixture = {
  version: 1,
  symbol: '600519.SH',
  price: 10,
  open: 10,
  high: 11,
  low: 9,
  previousClose: 10,
  volume: 1,
  amount: 10,
  marketTime: '2026-10-01T00:00:00Z',
  fetchedAt: '2026-10-01T00:00:00Z',
  freshness: 'live',
  stale: false,
  provider: 'fixture',
};
export const navFixture = {
  version: 1,
  symbol: '000001.OF',
  unitNav: 1.1,
  navDate: '2026-10-01T00:00:00Z',
  fetchedAt: '2026-10-01T00:00:00Z',
  provider: 'fixture',
  freshness: 'delayed',
};

export function qualityMarketFixture(quality: Pick<DataQualityService, 'observe'>) {
  const values = new Map<string, string>();
  const multi = {
    set: (key: string, value: string) => {
      values.set(key, value);
      return multi;
    },
    exec: vi.fn(async () => []),
  };
  const dsa = {
    marketCacheContextV3: vi.fn(quoteControlFixture),
    get: vi.fn(async (): Promise<unknown> => ({ version: 3 })),
  };
  const redis = {
    client: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async () => 'OK'),
      eval: vi.fn(async () => 0),
      multi: vi.fn(() => multi),
    },
  };
  return {
    dsa,
    values,
    service: new MarketService(
      dsa as never,
      redis as never,
      undefined,
      undefined,
      undefined,
      quality as DataQualityService,
    ),
  };
}
