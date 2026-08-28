import { describe, expect, it, vi } from 'vitest';
import { resolveFx } from '../../src/market/fx-conversion.js';

const fxResponse = (rate: number, provider: string) => ({
  version: 1 as const,
  baseCurrency: 'CNY' as const,
  asOf: '2025-01-02',
  fetchedAt: '2025-01-02T00:00:00.000Z',
  maxAgeDays: 7,
  rates: [
    {
      fromCurrency: 'CNY' as const,
      toCurrency: 'CNY' as const,
      rate: 1,
      rateDate: '2025-01-02',
      provider: 'identity',
      fetchedAt: '2025-01-02T00:00:00.000Z',
      freshness: 'live' as const,
      stale: false,
      ageDays: 0,
      available: true,
    },
    {
      fromCurrency: 'HKD' as const,
      toCurrency: 'CNY' as const,
      rate,
      rateDate: '2025-01-02',
      provider,
      fetchedAt: '2025-01-02T00:00:00.000Z',
      freshness: 'live' as const,
      stale: false,
      ageDays: 0,
      available: true,
    },
  ],
});

describe('FX Conversion View', () => {
  it('汇率修订会生成新的来源证据版本', async () => {
    const market = {
      getFxRates: vi
        .fn()
        .mockResolvedValueOnce(fxResponse(0.92, 'provider-a'))
        .mockResolvedValueOnce(fxResponse(0.93, 'provider-b')),
    };
    const options = { fxMerge: true, baseCurrency: 'CNY' as const };
    const first = await resolveFx(
      market,
      ['CNY', 'HKD'],
      options,
      new Date('2025-01-02T00:00:00.000Z'),
      'historical-rate',
    );
    const revised = await resolveFx(
      market,
      ['CNY', 'HKD'],
      options,
      new Date('2025-01-02T00:00:00.000Z'),
      'historical-rate',
    );

    expect(first.meta).toMatchObject({
      conversionMode: 'historical-rate',
      status: 'ready',
      asOf: '2025-01-02',
    });
    expect(revised.meta.evidenceVersion).not.toBe(first.meta.evidenceVersion);
    expect(revised.rates.get('HKD')).toBe(0.93);
  });
});
