import { Prisma } from '@prisma/client';
import type { Currency, PerformancePnlPoint } from '@thesis-ledger/schemas';
import { performancePnlQuerySchema } from '@thesis-ledger/schemas';
import { roundMoney } from '@thesis-ledger/shared';
import type { RealizedPnlAtTime } from '../ledger/trade-realized-pnl-history.service.js';
import { snapshotPayload } from './performance-types.js';

export type PnlSnapshot = {
  id: string;
  accountId: string | null;
  capturedAt: Date;
  baseCurrency: string;
  valuationStatus: string;
  marketValue: Prisma.Decimal | string | number | null;
  costValue: Prisma.Decimal | string | number | null;
  payload: unknown;
};

const frozenAccountIdsSchema = performancePnlQuerySchema.shape.accountId.unwrap().array();

export const pnlSnapshotAccountIds = (snapshot: PnlSnapshot): string[] | null => {
  if (snapshot.accountId) return [snapshot.accountId];
  const payload = snapshotPayload(snapshot.payload);
  const ids = frozenAccountIdsSchema.safeParse(payload.accountIds);
  if (payload.accountScopePolicy !== 'investment-only-v1' || !ids.success) return null;
  return [...new Set(ids.data)].sort();
};

export const frozenRate = (snapshot: PnlSnapshot, from: string, to: Currency) => {
  if (from === to) return 1;
  const fx = snapshotPayload(snapshotPayload(snapshot.payload).fx);
  const base = typeof fx.baseCurrency === 'string' ? fx.baseCurrency : snapshot.baseCurrency;
  const rates = new Map<string, number>([[base, 1]]);
  if (Array.isArray(fx.rates)) {
    for (const value of fx.rates) {
      const rate = snapshotPayload(value);
      if (
        rate.toCurrency === base &&
        typeof rate.fromCurrency === 'string' &&
        rate.available === true &&
        rate.stale !== true &&
        typeof rate.rate === 'number' &&
        Number.isFinite(rate.rate) &&
        rate.rate > 0
      )
        rates.set(rate.fromCurrency, rate.rate);
    }
  }
  const sourceRate = rates.get(from);
  const targetRate = rates.get(to);
  return sourceRate !== undefined && targetRate !== undefined ? sourceRate / targetRate : null;
};

export function projectSnapshotPnl(
  snapshot: PnlSnapshot,
  realized: RealizedPnlAtTime | undefined,
  currency: Currency,
): PerformancePnlPoint {
  const point: PerformancePnlPoint = {
    at: snapshot.capturedAt.toISOString(),
    sourceSnapshotId: snapshot.id,
    value: null,
    unrealizedPnl: null,
    realizedPnl: null,
    reason: null,
  };
  const payload = snapshotPayload(snapshot.payload);
  const quality = snapshotPayload(payload.dataQuality);
  if (
    snapshot.valuationStatus !== 'COMPLETE' ||
    payload.partial === true ||
    quality.partial === true ||
    snapshot.marketValue === null ||
    snapshot.costValue === null ||
    !Number.isFinite(Number(snapshot.marketValue)) ||
    !Number.isFinite(Number(snapshot.costValue))
  ) {
    return { ...point, reason: 'price_unavailable' };
  }
  if (pnlSnapshotAccountIds(snapshot) === null) return { ...point, reason: 'scope_unavailable' };
  if (!realized?.complete) return { ...point, reason: 'realized_unavailable' };
  const valueRate = frozenRate(snapshot, snapshot.baseCurrency, currency);
  if (valueRate === null) return { ...point, reason: 'fx_unavailable' };
  let realizedValue = new Prisma.Decimal(0);
  for (const amount of realized.pnl) {
    const rate = frozenRate(snapshot, amount.currency, currency);
    if (rate === null) return { ...point, reason: 'fx_unavailable' };
    realizedValue = realizedValue.plus(new Prisma.Decimal(amount.amount).times(rate));
  }
  const unrealizedValue = new Prisma.Decimal(String(snapshot.marketValue))
    .minus(String(snapshot.costValue))
    .times(valueRate);
  const realizedPnl = roundMoney(realizedValue.toNumber());
  const unrealizedPnl = roundMoney(unrealizedValue.toNumber());
  return {
    ...point,
    value: roundMoney(unrealizedPnl + realizedPnl),
    unrealizedPnl,
    realizedPnl,
  };
}
