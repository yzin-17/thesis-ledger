import { type ResolvedFx } from '../market/fx-conversion.js';
import type { valueSnapshotPosition } from './performance-snapshot-position-valuation.js';
import {
  officialSnapshotEvidenceVersion,
  type SnapshotEconomicInputs,
} from './performance-snapshot-inputs.js';
import {
  fxResponseFields,
  partialSnapshot,
  snapshotMissingSymbols,
  type Currency,
  type NativeSnapshotCurrency,
  type PerformanceFxMeta,
  type PerformanceSnapshot,
  type PortfolioMode,
  type SnapshotCaptureContext,
} from './performance-types.js';

type SnapshotPositionValue = Awaited<ReturnType<typeof valueSnapshotPosition>>;
export function snapshotNativeCurrencies(
  valued: readonly SnapshotPositionValue[],
  cashAmounts: SnapshotEconomicInputs['cashAmounts'],
) {
  const nativeByCurrencyMap = new Map<Currency, NativeSnapshotCurrency>();
  const ensureNativeCurrency = (currency: Currency) => {
    const current = nativeByCurrencyMap.get(currency) ?? {
      currency,
      marketValue: null,
      costValue: 0,
      cashValue: 0,
    };
    nativeByCurrencyMap.set(currency, current);
    return current;
  };
  for (const position of valued) {
    const current = ensureNativeCurrency(position.currency);
    current.costValue += position.nativeCostValue;
    if (position.marketValue !== null)
      current.marketValue = (current.marketValue ?? 0) + position.marketValue;
  }
  for (const item of cashAmounts) ensureNativeCurrency(item.currency).cashValue += item.amount;
  const nativeByCurrency = [...nativeByCurrencyMap.values()];
  return nativeByCurrency;
}

type CaptureIdentityInput = {
  accountId: string | undefined;
  capturedAt: Date;
  mode: PortfolioMode;
  valuationDateKey: string;
  context: SnapshotCaptureContext;
  inputs: SnapshotEconomicInputs;
  valued: SnapshotPositionValue[];
  fx: PerformanceFxMeta;
  partial: boolean;
  missingSymbols: readonly string[];
};
export function snapshotCaptureIdentity({
  accountId,
  capturedAt,
  mode,
  valuationDateKey,
  context,
  inputs,
  valued,
  fx,
  partial,
  missingSymbols,
}: CaptureIdentityInput) {
  const scope = accountId ? 'account' : 'portfolio';
  const source = context.source ?? 'DAILY_CLOSE';
  const valuationBasis = context.valuationBasis ?? 'ESTIMATED';
  const scopeId = accountId ?? 'all';
  const eventSuffix =
    source === 'DAILY_CLOSE' ? '' : `:${source}:${context.sourceRef ?? capturedAt.toISOString()}`;
  const slotKey = `${scope}:${scopeId}:${mode}:${valuationDateKey}${eventSuffix}`;
  const defaultKeyTime = source === 'DAILY_CLOSE' ? valuationDateKey : capturedAt.toISOString();
  const evidenceVersion =
    valuationBasis === 'OFFICIAL'
      ? officialSnapshotEvidenceVersion(inputs, valued, fx.evidenceVersion)
      : undefined;
  const idempotencyKey =
    context.idempotencyKey ??
    `${source.toLowerCase()}:${scope}:${scopeId}:${mode}:${defaultKeyTime}:${valuationBasis.toLowerCase()}${evidenceVersion ? `:${evidenceVersion}` : ''}`;
  const pricedCoverage =
    context.pricedCoverage ??
    (valued.length === 0 ? 1 : (valued.length - missingSymbols.length) / valued.length);
  const disclosureCoverage = context.disclosureCoverage ?? inputs.disclosureCoverage;
  let valuationStatus: 'UNAVAILABLE' | 'PARTIAL' | 'COMPLETE' = 'COMPLETE';
  if (pricedCoverage === 0 && valued.length > 0) valuationStatus = 'UNAVAILABLE';
  else if (partial) valuationStatus = 'PARTIAL';
  if (
    valuationBasis === 'OFFICIAL' &&
    (valuationStatus !== 'COMPLETE' || !['ready', 'not_needed'].includes(fx.status))
  ) {
    throw new Error('正式估值所需行情、净值或汇率尚未齐备');
  }
  return {
    scope,
    source,
    valuationBasis,
    slotKey,
    evidenceVersion,
    idempotencyKey,
    pricedCoverage,
    disclosureCoverage,
    valuationStatus,
  } as const;
}

export function mergeAccountSnapshotHistory<T extends PerformanceSnapshot>(
  filtered: readonly T[],
  accountCurrencyMap: ReadonlyMap<string, string>,
  fxByDate: ReadonlyMap<number, ResolvedFx>,
  mode: PortfolioMode,
  withFx: (snapshot: T, fx: ResolvedFx) => PerformanceSnapshot,
) {
  const byAccount = new Map<string, T[]>();
  for (const id of accountCurrencyMap.keys()) {
    if (!id.startsWith('__currency-')) byAccount.set(id, []);
  }
  for (const snapshot of filtered) {
    const key = snapshot.accountId ?? '__portfolio';
    const values = byAccount.get(key) ?? [];
    values.push(snapshot);
    byAccount.set(key, values);
  }
  const timestamps = [...new Set(filtered.map((snapshot) => snapshot.capturedAt.getTime()))].sort(
    (left, right) => left - right,
  );
  const merged: PerformanceSnapshot[] = [];
  for (const timestamp of timestamps) {
    const point = mergedSnapshotAt(byAccount, timestamp, fxByDate, mode, withFx);
    if (point) merged.push(point);
  }
  return merged;
}

function mergedSnapshotAt<T extends PerformanceSnapshot>(
  byAccount: ReadonlyMap<string, T[]>,
  timestamp: number,
  fxByDate: ReadonlyMap<number, ResolvedFx>,
  mode: PortfolioMode,
  withFx: (snapshot: T, fx: ResolvedFx) => PerformanceSnapshot,
): PerformanceSnapshot | null {
  let marketValue = 0;
  let costValue = 0;
  let cashValue = 0;
  let partial = false;
  const missingSymbols: string[] = [];
  const evidence: PerformanceFxMeta[] = [];
  let included = 0;
  for (const accountSnapshots of byAccount.values()) {
    const point = [...accountSnapshots]
      .reverse()
      .find((snapshot) => snapshot.capturedAt.getTime() <= timestamp);
    if (!point) {
      partial = true;
      continue;
    }
    const pointFx = fxByDate.get(point.capturedAt.getTime());
    if (!pointFx) {
      partial = true;
      continue;
    }
    const converted = withFx(point, pointFx);
    if (converted.currency !== pointFx.meta.baseCurrency) {
      partial = true;
      continue;
    }
    included += 1;
    marketValue += Number(converted.marketValue);
    costValue += Number(converted.costValue ?? 0);
    cashValue += Number(converted.cashValue);
    missingSymbols.push(...snapshotMissingSymbols(point));
    partial ||= partialSnapshot(point);
    evidence.push(pointFx.meta);
  }
  if (included === 0) return null;
  const primaryFx = evidence[0];
  return {
    id: `fx-${timestamp}`,
    accountId: null,
    capturedAt: new Date(timestamp),
    marketValue,
    costValue,
    cashValue,
    ...(primaryFx?.baseCurrency ? { currency: primaryFx.baseCurrency } : {}),
    payload: {
      mode,
      accountScopePolicy: 'investment-only-v1',
      partial,
      missingSymbols: [...new Set(missingSymbols)],
      dataQuality: { partial, missingSymbols: [...new Set(missingSymbols)] },
      fx: primaryFx,
      fxEvidence: evidence,
    },
    ...(primaryFx ? fxResponseFields(primaryFx) : {}),
  };
}
