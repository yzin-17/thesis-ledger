import { Prisma } from '@prisma/client';
import { currencySchema, type Currency, type PerformancePnlPoint } from '@thesis-ledger/schemas';
import type { RealizedPnlAtTime } from '../ledger/trade-realized-pnl-history.service.js';
import { snapshotPayload } from './performance-types.js';
import { frozenRate, projectSnapshotPnl, type PnlSnapshot } from './performance-pnl-projection.js';

export function projectInstrumentSnapshotPnl(
  snapshot: PnlSnapshot,
  realized: RealizedPnlAtTime | undefined,
  currency: Currency,
  symbol: string,
): PerformancePnlPoint {
  const missing = (reason: PerformancePnlPoint['reason']): PerformancePnlPoint => ({
    at: snapshot.capturedAt.toISOString(),
    sourceSnapshotId: snapshot.id,
    value: null,
    unrealizedPnl: null,
    realizedPnl: null,
    reason,
  });
  const payload = snapshotPayload(snapshot.payload);
  if (!Array.isArray(payload.positions)) return missing('position_unavailable');
  let marketValue = new Prisma.Decimal(0);
  let costValue = new Prisma.Decimal(0);
  for (const value of payload.positions) {
    const row = snapshotPayload(value);
    if (typeof row.symbol !== 'string') return missing('position_unavailable');
    if (row.symbol !== symbol) continue;
    const rowCurrency = currencySchema.safeParse(row.currency);
    if (!rowCurrency.success) return missing('fx_unavailable');
    if (row.stale === true || row.freshness === 'stale') return missing('price_unavailable');
    const price = frozenNumber(row.marketValue);
    const cost = frozenNumber(row.nativeCostValue);
    if (price === null || cost === null) return missing('price_unavailable');
    const rate = frozenRate(snapshot, rowCurrency.data, currency);
    if (rate === null) return missing('fx_unavailable');
    marketValue = marketValue.plus(new Prisma.Decimal(price).times(rate));
    costValue = costValue.plus(new Prisma.Decimal(cost).times(rate));
  }
  return projectSnapshotPnl(
    {
      ...snapshot,
      baseCurrency: currency,
      marketValue,
      costValue,
      valuationStatus: 'COMPLETE',
      payload: { ...payload, partial: false, dataQuality: { partial: false } },
    },
    realized,
    currency,
  );
}

const frozenNumber = (value: unknown): string | null => {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '')
    return null;
  return Number.isFinite(Number(value)) ? String(value) : null;
};

export function currentInstrumentRealizedPnl(
  summary: RealizedPnlAtTime | undefined,
  currency: Currency,
) {
  if (!summary?.complete || summary.pnl.some((item) => item.currency !== currency)) return null;
  return summary.pnl
    .reduce((total, item) => total.plus(item.amount), new Prisma.Decimal(0))
    .toNumber();
}
