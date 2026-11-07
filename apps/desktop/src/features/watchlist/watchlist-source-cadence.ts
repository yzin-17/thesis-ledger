import type {
  MarketRouteCatalogReadClientV3,
  WatchlistItem,
  WatchlistPrice,
} from '@thesis-ledger/schemas';
import { accountAccessSelectable } from '../market-data/provider-account-access.js';
export type SourceCadence = { seconds: number; label: string };
export type CadenceCatalog = MarketRouteCatalogReadClientV3 | undefined;
export function watchlistSourceCadence(
  item: WatchlistItem,
  source: { provider: string; upstreamSource?: string | undefined } | undefined,
  catalog: CadenceCatalog,
  now = Date.now(),
): SourceCadence | null {
  if (item.instrument.instrumentType === 'MUTUAL_FUND')
    return { seconds: 86400, label: '每日净值' };
  if (!source?.upstreamSource || catalog?.status !== 'complete') return null;
  let market = 'CN';
  if (item.instrument.market === 'HK') market = 'HK';
  else if (item.instrument.market === 'US') market = 'US';
  const rows = catalog.entries.filter(
    (entry) =>
      entry.target.providerId === source.provider &&
      entry.target.upstreamSource === source.upstreamSource &&
      entry.state === 'ready' &&
      accountAccessSelectable(entry.accountAccess, now) &&
      entry.key.kind === 'bar' &&
      entry.key.market === market &&
      entry.key.assetType === item.instrument.instrumentType,
  );
  // These are native source contracts; 5m/15m client-derived periods are deliberately absent.
  if (rows.some((entry) => entry.key.kind === 'bar' && entry.key.timeframe === '1m'))
    return { seconds: 60, label: '1分钟' };
  if (rows.some((entry) => entry.key.kind === 'bar' && entry.key.timeframe === '1d'))
    return { seconds: 86400, label: '日线' };
  return null;
}
export function quoteCadence(
  item: WatchlistItem,
  snap: WatchlistPrice | undefined,
  catalog: CadenceCatalog,
) {
  const source = snap?.price.kind === 'quote' ? snap.price.quote : undefined;
  const cadence = watchlistSourceCadence(item, source, catalog);
  if (!cadence) return null;
  return { ...cadence, seconds: Math.max(cadence.seconds, snap?.minRefreshSeconds ?? 0) };
}
/** Session boundary checks do not claim the market data itself has changed. */
export function sourceNextCheck(checkedAt: number, seconds: number, snap?: WatchlistPrice) {
  const context = snap?.quoteContext;
  const rawBoundary = context?.nextBoundaryAt ? Date.parse(context.nextBoundaryAt) : Infinity;
  const boundary = rawBoundary > checkedAt ? rawBoundary : Infinity;
  if (context?.session === 'closed_snapshot' && rawBoundary > checkedAt)
    return Math.min(boundary, checkedAt + 6 * 3600_000);
  return Math.min(boundary, checkedAt + seconds * 1000);
}
export type CheckedWatchlistPrices = { rows: WatchlistPrice[]; checkedAt: Record<string, number> };
export function nextQuoteCheck(
  data: CheckedWatchlistPrices | undefined,
  items: WatchlistItem[],
  catalog: CadenceCatalog,
  failedAt = 0,
) {
  if (!data) return Infinity;
  return Math.min(
    Infinity,
    ...items.map((item) => {
      const row = data.rows.find((entry) => entry.itemId === item.id);
      const cadence = quoteCadence(item, row, catalog);
      if (!cadence) return Infinity;
      return sourceNextCheck(
        Math.max(data.checkedAt[item.id] ?? 0, failedAt),
        cadence.seconds,
        row,
      );
    }),
  );
}
export async function readDueWatchlistPrices(
  previous: CheckedWatchlistPrices | undefined,
  items: WatchlistItem[],
  catalog: CadenceCatalog,
  read: (ids: string[]) => Promise<WatchlistPrice[]>,
  force = false,
  now = Date.now(),
): Promise<CheckedWatchlistPrices> {
  const due = items
    .filter((item) => {
      const row = previous?.rows.find((entry) => entry.itemId === item.id);
      if (force || !row) return true;
      const cadence = quoteCadence(item, row, catalog);
      return (
        cadence && sourceNextCheck(previous?.checkedAt[item.id] ?? 0, cadence.seconds, row) <= now
      );
    })
    .map((item) => item.id);
  if (!due.length && previous) return previous;
  const fresh = await read(due);
  const checkedAt = { ...previous?.checkedAt };
  for (const id of due) checkedAt[id] = now;
  const byId = new Map(previous?.rows.map((row) => [row.itemId, row]));
  for (const row of fresh) byId.set(row.itemId, row);
  return {
    rows: items.flatMap((item) => {
      const row = byId.get(item.id);
      return row ? [row] : [];
    }),
    checkedAt,
  };
}
