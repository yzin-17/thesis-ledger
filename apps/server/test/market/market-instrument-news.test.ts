import { expect, it, vi } from 'vitest';
import { MarketInstrumentEvidence } from '../../src/market/market-instrument-evidence.js';

it('竞技场读取与详情相同的首屏，保留第五条个股新闻并排除其他标的的条目', async () => {
  const symbol = '600036.SH';
  const instrument = { market: 'CN', assetType: 'STOCK', symbol } as const;
  const publishedAt = new Date(Date.now() - 60_000).toISOString();
  const fetchedAt = new Date().toISOString();
  const read = vi.fn(async ({ limit }: { limit: number }) => ({
    items: Array.from({ length: limit }, (_, i) => ({
      id: String(i),
      title: '新闻 ' + i,
      publishedAt,
      fetchedAt,
      url: 'https://example.org/' + i,
      relatedInstruments: [i === 2 ? { ...instrument, symbol: '600519.SH' } : instrument],
    })),
  }));
  const market = new MarketInstrumentEvidence(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { read } as never,
    {} as never,
  );
  const facts = await market.recentNews(
    { market: 'CN', timeZone: 'Asia/Shanghai', instruments: [instrument] },
    new Date(Date.now() + 10_000),
  );
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({ instrument, limit: 5 }),
    expect.any(AbortSignal),
  );
  expect(facts.map((f) => f.ref)).toEqual([
    '600036.SH:0',
    '600036.SH:1',
    '600036.SH:3',
    '600036.SH:4',
  ]);
  expect(facts.every((f) => Date.parse(f.availableAt) >= Date.parse(fetchedAt))).toBe(true);
});
