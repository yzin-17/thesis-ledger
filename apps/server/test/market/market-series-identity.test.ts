import { describe, expect, it } from 'vitest';
import type { BarPoint, BarSeriesIdentity, SourcePriceBasisFact } from '@thesis-ledger/schemas';
import {
  createMarketSeriesIdentity,
  marketSeriesBasisCacheKey,
  resolveMarketSeriesIdentity,
} from '../../src/market/market-series-identity.js';

const identity: BarSeriesIdentity = {
  symbol: '510300.SH',
  assetType: 'ETF',
  timeframe: '1d',
  adjustment: 'qfq',
};

const points: BarPoint[] = [
  {
    timestamp: '2025-01-02T07:00:00.000Z',
    open: 1,
    high: 1.1,
    low: 0.9,
    close: 1,
    volume: 100,
    amount: 1000,
    completionStatus: 'complete',
    availableAt: '2025-01-02T08:00:00.000Z',
  },
  {
    timestamp: '2025-01-03T07:00:00.000Z',
    open: 1,
    high: 1.1,
    low: 0.9,
    close: 1,
    volume: 100,
    amount: 1000,
    completionStatus: 'complete',
    availableAt: '2025-01-03T08:00:00.000Z',
  },
];

const sourcePriceBasis = (overrides: Partial<SourcePriceBasisFact> = {}): SourcePriceBasisFact => ({
  adjustment: 'qfq',
  method: 'provider-native',
  methodVersion: 'provider-qfq-v2',
  basisScope: 'global',
  anchor: '2025-01-03',
  revision: { origin: 'provider', id: 'revision-7' },
  observedAt: '2025-01-03T08:01:00.000Z',
  volumeBasis: 'original',
  dividendMeaning: 'provider-defined',
  dividendEvidenceRef: null,
  conversionAvailable: false,
  conversionEvidenceRef: null,
  derivation: null,
  ...overrides,
});

const source = { providerId: 'tencent', upstreamSource: 'tencent' };

describe('market series identity', () => {
  it('相同数值的手数和股数不能共享序列或缓存身份', () => {
    const basis = sourcePriceBasis();
    const hands = sourcePriceBasis({ fieldUnits: { volume: 'hand', amount: 'CNY' } });
    const shares = sourcePriceBasis({ fieldUnits: { volume: 'share', amount: 'CNY' } });
    const versions = [basis, hands, shares].map(
      (priceBasis) =>
        createMarketSeriesIdentity({ identity, ...source, priceBasis, points }).seriesVersion,
    );
    expect(new Set(versions).size).toBe(3);
    expect(marketSeriesBasisCacheKey(identity, hands)).not.toBe(
      marketSeriesBasisCacheKey(identity, shares),
    );
  });
  it('uses an upstream price basis revision and isolates the anchor, revision, and source', () => {
    const base = createMarketSeriesIdentity({
      identity,
      ...source,
      priceBasis: sourcePriceBasis(),
      points,
    });
    expect(base.identityStatus).toBe('identified');
    expect(
      createMarketSeriesIdentity({
        identity,
        ...source,
        priceBasis: sourcePriceBasis({ anchor: '2024-12-31' }),
        points,
      }).seriesVersion,
    ).not.toBe(base.seriesVersion);
    expect(
      createMarketSeriesIdentity({
        identity,
        ...source,
        priceBasis: sourcePriceBasis({ revision: { origin: 'provider', id: 'revision-8' } }),
        points,
      }).seriesVersion,
    ).not.toBe(base.seriesVersion);
    expect(
      createMarketSeriesIdentity({
        identity,
        providerId: 'eastmoney',
        upstreamSource: 'eastmoney',
        priceBasis: sourcePriceBasis(),
        points,
      }).seriesVersion,
    ).not.toBe(base.seriesVersion);
  });

  it('excludes observation time from a known basis and keeps request-window scope explicit', () => {
    const basis = sourcePriceBasis();
    const observedLater = sourcePriceBasis({ observedAt: '2025-01-04T08:01:00.000Z' });
    expect(marketSeriesBasisCacheKey(identity, observedLater)).toBe(
      marketSeriesBasisCacheKey(identity, basis),
    );
    expect(
      createMarketSeriesIdentity({ identity, ...source, priceBasis: observedLater, points })
        .seriesVersion,
    ).toBe(
      createMarketSeriesIdentity({ identity, ...source, priceBasis: basis, points }).seriesVersion,
    );

    const windowBasis = sourcePriceBasis({ basisScope: 'request-window' });
    expect(
      createMarketSeriesIdentity({ identity, ...source, priceBasis: windowBasis, points })
        .identityStatus,
    ).toBe('unknown');
    const firstWindow = {
      start: '2025-01-01T00:00:00.000Z',
      end: '2025-01-03T23:59:59.999Z',
    };
    const secondWindow = { ...firstWindow, start: '2025-01-02T00:00:00.000Z' };
    const first = createMarketSeriesIdentity({
      identity,
      ...source,
      priceBasis: windowBasis,
      basisWindow: firstWindow,
      points,
    });
    const second = createMarketSeriesIdentity({
      identity,
      ...source,
      priceBasis: windowBasis,
      basisWindow: secondWindow,
      points,
    });
    expect(first.identityStatus).toBe('identified');
    expect(first.seriesVersion).not.toBe(second.seriesVersion);
  });

  it('uses an explicit local observation hash when the upstream V2 series has no basis facts', () => {
    const version = createMarketSeriesIdentity({ identity, ...source, points });
    expect(version.identityStatus).toBe('unknown');
    expect(version.seriesVersion).toMatch(/^market-series-v1:unknown:[a-f0-9]{64}$/);
    expect(resolveMarketSeriesIdentity({ identity, ...source })).toBeNull();
    expect(
      createMarketSeriesIdentity({
        identity,
        ...source,
        points: points.map((point, index) => (index === 1 ? { ...point, close: 1.05 } : point)),
      }).seriesVersion,
    ).not.toBe(version.seriesVersion);
  });

  it('refuses to bind a basis whose adjustment contradicts the series', () => {
    expect(() =>
      createMarketSeriesIdentity({
        identity,
        ...source,
        priceBasis: sourcePriceBasis({ adjustment: 'hfq' }),
        points,
      }),
    ).toThrow('价格口径与行情序列 identity 不一致');
  });
});
