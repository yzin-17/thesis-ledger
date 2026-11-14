import { watchlistPageSchema, watchlistPricesSchema } from '@thesis-ledger/schemas';
import samples from './watchlist-number-samples.json';
export { samples as watchlistNumberSamples };
export const watchlistSampleId = '00000000-0000-4000-8000-000000000001';
export function watchlistNumberSample(name: string) {
  const sample = samples.find((s) => s.name === name);
  if (!sample && !['nav', 'unavailable'].includes(name)) throw new Error('未知自选数值样本');
  const fund = name === 'nav';
  const symbol = fund ? '000001.OF' : '000001.SZ';
  const item = {
    id: watchlistSampleId,
    displayName: '精度验收标的',
    pinned: false,
    groupId: null,
    order: 0,
    addedAt: '2026-11-05T00:00:00Z',
    instrument: {
      id: watchlistSampleId,
      canonicalCode: '000001',
      market: fund ? 'OF' : 'SZ',
      instrumentType: fund ? 'MUTUAL_FUND' : 'STOCK',
      active: true,
    },
  };
  const page = watchlistPageSchema.parse({
    revision: 1,
    items: [item],
    groups: [],
    nextOffset: null,
  });
  const quote = sample
    ? {
        version: 3,
        symbol,
        price: sample.price,
        previousClose: sample.previousClose,
        open: sample.open,
        high: sample.high,
        low: sample.low,
        volume: null,
        amount: null,
        marketTime: name === 'near-positive' ? null : '2026-11-06T08:00:00Z',
        provider: 'tencent',
        fetchedAt: '2026-11-07T00:00:00Z',
        freshness: 'live',
        stale: name === 'tiny',
        units: { priceCurrency: 'CNY', volume: 'share', turnoverCurrency: 'CNY' },
        ...(name === 'ordinary' && { refreshFailure: 'fetch_failed' }),
        ...(name === 'tiny' && { refreshFailure: 'budget_cooldown' }),
      }
    : undefined;
  let price: unknown;
  if (sample) price = { kind: 'quote', quote };
  else if (fund) {
    price = {
      kind: 'nav',
      nav: {
        version: 3,
        symbol,
        unitNav: 1e-7,
        navDate: '2026-11-06T00:00:00Z',
        provider: 'tushare',
        fetchedAt: '2026-11-07T00:00:00Z',
        freshness: 'delayed',
      },
    };
  } else price = { kind: 'unavailable', reason: 'not_eligible' };
  let session = 'trading';
  if (name === 'ordinary') session = 'closed_snapshot';
  else if (name === 'tiny') session = 'older_snapshot';
  const prices = watchlistPricesSchema.parse([
    {
      itemId: watchlistSampleId,
      held: true,
      price,
      ...(sample && {
        quoteContext: {
          session,
          evaluatedAt: '2026-11-07T00:00:00Z',
        },
      }),
    },
  ]);
  return {
    page,
    prices,
    symbol,
    expected: sample?.expected ?? {
      value: fund ? '1E-7' : '—',
      change: '—',
      changeAmount: '—',
      open: '—',
      previousClose: '—',
      high: '—',
      low: '—',
      amplitude: '—',
    },
  };
}
