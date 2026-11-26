import { expect, it, vi } from 'vitest';
import type {
  MarketRouteCatalogReadClientV3,
  WatchlistItem,
  WatchlistPrice,
} from '@thesis-ledger/schemas';
import {
  watchlistSourceCadence,
  quoteCadence,
  readDueWatchlistPrices,
  nextQuoteCheck,
  sourceNextCheck,
} from './watchlist-source-cadence.js';
const item = (id: string, market = 'SH') =>
  ({ id, instrument: { market, instrumentType: 'ETF' } }) as WatchlistItem;
const entry = (provider: string, timeframe: '1m' | '1d', market = 'CN') => ({
  state: 'ready',
  target: { providerId: provider, upstreamSource: provider },
  key: { kind: 'bar', assetType: 'ETF', market, timeframe },
});
const catalog = {
  status: 'complete',
  entries: [entry('minute', '1m'), entry('day', '1d'), entry('day', '1m', 'US')],
} as MarketRouteCatalogReadClientV3;
const row = (id: string, provider: string, minRefreshSeconds = 0) =>
  ({
    itemId: id,
    price: { kind: 'quote', quote: { provider, upstreamSource: provider } },
    quoteContext: { session: 'trading' },
    minRefreshSeconds,
  }) as WatchlistPrice;
it('按实际来源、上游和市场匹配最小原生周期，不套用其他市场或来源', () => {
  expect(
    watchlistSourceCadence(item('a'), { provider: 'minute', upstreamSource: 'minute' }, catalog)
      ?.seconds,
  ).toBe(60);
  expect(
    watchlistSourceCadence(item('a'), { provider: 'day', upstreamSource: 'day' }, catalog)?.seconds,
  ).toBe(86400);
  expect(
    watchlistSourceCadence(item('a', 'US'), { provider: 'day', upstreamSource: 'day' }, catalog)
      ?.seconds,
  ).toBe(60);
  expect(
    watchlistSourceCadence(item('a'), { provider: 'minute', upstreamSource: 'other' }, catalog),
  ).toBeNull();
  expect(watchlistSourceCadence(item('a'), { provider: 'minute' }, catalog)).toBeNull();
});
it('不完整、不可用、无资格目录不猜频率；报价请求限额仍优先', () => {
  const source = { provider: 'minute', upstreamSource: 'minute' };
  expect(watchlistSourceCadence(item('a'), source, { ...catalog, status: 'partial' })).toBeNull();
  expect(
    watchlistSourceCadence(item('a'), source, {
      ...catalog,
      entries: [{ ...catalog.entries[0]!, state: 'not_admitted' }],
    }),
  ).toBeNull();
  expect(
    watchlistSourceCadence(item('a'), source, {
      ...catalog,
      entries: [{ ...catalog.entries[0]!, accountAccess: { state: 'unknown', attempted: false } }],
    }),
  ).toBeNull();
  expect(quoteCadence(item('a'), row('a', 'minute', 600), catalog)?.seconds).toBe(600);
  expect(
    nextQuoteCheck({ rows: [row('a', 'unknown')], checkedAt: { a: 0 } }, [item('a')], catalog),
  ).toBe(Infinity);
});
it('混合页只读取到期来源，手动刷新读取显式集合；下一次返回新来源后重算', async () => {
  const items = [item('a'), item('b')];
  const read = vi
    .fn<(ids: string[]) => Promise<WatchlistPrice[]>>()
    .mockResolvedValue([row('a', 'day')]);
  const previous = { rows: [row('a', 'minute'), row('b', 'day')], checkedAt: { a: 0, b: 0 } };
  const result = await readDueWatchlistPrices(previous, items, catalog, read, false, 60_000);
  expect(read).toHaveBeenCalledWith(['a']);
  expect(result.checkedAt).toEqual({ a: 60_000, b: 0 });
  expect(result.rows[1]).toBe(previous.rows[1]);
  expect(nextQuoteCheck(result, items, catalog)).toBe(86400_000);
  await readDueWatchlistPrices(result, items, catalog, read, true, 61_000);
  expect(read).toHaveBeenLastCalledWith(['a', 'b']);
});
it('自动刷新只消费已确认且未过期的账号资格，首次尝试资格不能认证刷新频率', () => {
  const source = { provider: 'minute', upstreamSource: 'minute' };
  const access = {
    state: 'allowed',
    attempted: true,
    checkedAt: '2026-11-09T00:00:00Z',
    validUntil: '2026-11-10T00:00:00Z',
    configVersion: 1,
  } as const;
  const withAccess = (accountAccess: (typeof catalog.entries)[number]['accountAccess']) => ({
    ...catalog,
    entries: [{ ...catalog.entries[0]!, accountAccess }],
  });
  expect(
    watchlistSourceCadence(item('a'), source, withAccess(access), Date.parse(access.checkedAt))
      ?.seconds,
  ).toBe(60);
  expect(
    watchlistSourceCadence(item('a'), source, withAccess(access), Date.parse(access.validUntil)),
  ).toBeNull();
  for (const state of [
    'unknown',
    'not_included',
    'permission_missing',
    'credential_invalid',
  ] as const) {
    expect(
      watchlistSourceCadence(
        item('a'),
        source,
        withAccess({ ...access, state }),
        Date.parse(access.checkedAt),
      ),
    ).toBeNull();
  }
});
it('休市到开市再检查，过去边界和失败不会造成一秒重试循环', () => {
  const close = {
    ...row('a', 'minute'),
    quoteContext: { session: 'closed_snapshot', nextBoundaryAt: '2026-11-09T01:30:00Z' },
  } as WatchlistPrice;
  const before = Date.parse('2026-11-09T00:00:00Z'),
    open = Date.parse('2026-11-09T01:30:00Z');
  expect(sourceNextCheck(before, 60, close)).toBe(open);
  expect(sourceNextCheck(open, 60, close)).toBeGreaterThan(open);
  const data = { rows: [row('a', 'minute')], checkedAt: { a: 0 } };
  expect(nextQuoteCheck(data, [item('a')], catalog, 90_000)).toBe(150_000);
});
