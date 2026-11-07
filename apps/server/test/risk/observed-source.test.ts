import { describe, expect, it } from 'vitest';
import { riskObservedSource } from '../../src/risk/risk-observed-source.js';
import type { ObservedMarketValue } from '../../src/market/market-observations.service.js';
const now = new Date('2026-11-06T07:00:00Z');
const quote = (freshness = 'live', marketTime = now.toISOString(), fetchedAt = now.toISOString()) =>
  ({
    sourceTime: marketTime,
    fingerprint: marketTime,
    observation: {
      kind: 'quote',
      value: {
        symbol: '600519.SH',
        price: 90,
        freshness,
        marketTime,
        fetchedAt,
        stale: freshness === 'stale',
      },
    },
  }) as ObservedMarketValue;
describe('automatic risk consumes observed data without remote requests', () => {
  it('accepts fresh quotes from a selected backup while preserving fallback provenance', async () => {
    const row = quote();
    if (row.observation.kind !== 'quote') throw new Error('quote fixture required');
    row.observation.value.fallbackUsed = true;
    expect((await riskObservedSource([row], now).getQuote('600519.SH')).fallbackUsed).toBe(true);
  });
  it('retains delayed and source time rather than relabelling live', async () => {
    const value = await riskObservedSource(
      [quote('delayed', '2026-11-06T06:45:00Z')],
      now,
    ).getQuote('600519.SH');
    expect(value.freshness).toBe('delayed');
    expect(value.marketTime).toBe('2026-11-06T06:45:00Z');
  });
  it.each([
    quote('stale'),
    quote('unknown'),
    quote('live', '2026-11-06T06:00:00Z'),
    quote('live', now.toISOString(), '2026-11-06T06:00:00Z'),
    quote('live', '2026-11-06T07:01:00Z'),
  ])('rejects stale/old/future/unknown observations', async (row) => {
    await expect(riskObservedSource([row], now).getQuote('600519.SH')).rejects.toThrow();
  });
  it('does not substitute the same bare code in another market', async () => {
    await expect(riskObservedSource([quote()], now).getQuote('600519.HK')).rejects.toThrow('等待');
  });
  it('accepts the previous official NAV date and preserves it', async () => {
    const nav = {
      kind: 'nav',
      value: {
        symbol: '000001.OF',
        unitNav: 1.2,
        navDate: '2026-11-05T00:00:00Z',
        fetchedAt: now.toISOString(),
        freshness: 'delayed',
      },
    };
    const value = await riskObservedSource(
      [{ observation: nav }] as ObservedMarketValue[],
      now,
    ).getFundNav('000001.OF');
    expect(value.navDate).toBe('2026-11-05T00:00:00Z');
    expect(value.freshness).toBe('delayed');
  });
  it('requires same-date FX instead of filling missing rates', async () => {
    const rows = [
      {
        observation: {
          kind: 'fx',
          value: {
            baseCurrency: 'CNY',
            asOf: '2026-11-05',
            fetchedAt: now.toISOString(),
            rates: [],
          },
        },
      },
    ] as unknown as ObservedMarketValue[];
    await expect(
      riskObservedSource(rows, now).getFxRates({
        baseCurrency: 'CNY',
        currencies: ['USD'],
        asOf: '2026-11-06',
      }),
    ).rejects.toThrow('等待');
  });
});
