import type { CurrencyV1 } from '@thesis-ledger/schemas';
import type { Prisma } from '@prisma/client';
import { supportedCurrency, type FxConversionMeta, type FxConversionMode, type FxConversionOptions } from '../market/fx-conversion.js';

export type PortfolioMode = 'actual' | 'shadow';
export type Currency = CurrencyV1;
export type PerformanceFxOptions = FxConversionOptions;
export type PerformanceFxMeta = FxConversionMeta;

export type NativeSnapshotCurrency = {
  currency: Currency;
  marketValue: number | null;
  costValue: number;
  cashValue: number;
};

export type PerformanceSnapshot = {
  id?: string;
  accountId?: string | null;
  capturedAt: Date;
  marketValue: unknown;
  costValue?: unknown;
  cashValue: unknown;
  payload: unknown;
  currency?: Currency;
  estimated?: boolean;
  conversionMode?: FxConversionMode;
  fxAsOf?: string;
  fxStale?: boolean;
  nativeByCurrency?: NativeSnapshotCurrency[];
};

export type PerformanceLedgerEvent = {
  accountId: string;
  type: string;
  occurredAt: Date | null;
  payload: Prisma.JsonValue | null;
};

export const snapshotPayload = (payload: unknown) =>
  payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

export const partialSnapshot = (snapshot: Pick<PerformanceSnapshot, 'payload'>) => {
  const payload = snapshotPayload(snapshot.payload);
  if (payload.partial === true) return true;
  const dataQuality = snapshotPayload(payload.dataQuality);
  return dataQuality.partial === true;
};

export const snapshotMissingSymbols = (snapshot: Pick<PerformanceSnapshot, 'payload'>) => {
  const payload = snapshotPayload(snapshot.payload);
  const direct = payload.missingSymbols;
  if (Array.isArray(direct)) return direct.map(String);
  const dataQuality = snapshotPayload(payload.dataQuality);
  return Array.isArray(dataQuality.missingSymbols) ? dataQuality.missingSymbols.map(String) : [];
};

export const snapshotFxMeta = (snapshot: Pick<PerformanceSnapshot, 'payload'>) => {
  const value = snapshotPayload(snapshot.payload).fx;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const meta = value as Partial<PerformanceFxMeta>;
  return typeof meta.status === 'string' ? (meta as PerformanceFxMeta) : undefined;
};

export const snapshotNativeByCurrency = (snapshot: Pick<PerformanceSnapshot, 'payload'>) => {
  const value = snapshotPayload(snapshot.payload).nativeByCurrency;
  if (!Array.isArray(value)) return undefined;
  const rows = value.flatMap((item): NativeSnapshotCurrency[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const currency = supportedCurrency(row.currency);
    const costValue = Number(row.costValue);
    const cashValue = Number(row.cashValue);
    if (!currency || !Number.isFinite(costValue) || !Number.isFinite(cashValue)) return [];
    const marketValue = row.marketValue === null ? null : Number(row.marketValue);
    if (marketValue !== null && !Number.isFinite(marketValue)) return [];
    return [{ currency, marketValue, costValue, cashValue }];
  });
  return rows.length > 0 ? rows : undefined;
};

export const snapshotValue = (snapshot: Pick<PerformanceSnapshot, 'marketValue' | 'cashValue'>) =>
  Number(snapshot.marketValue) + Number(snapshot.cashValue);

export const snapshotMode = (snapshot: PerformanceSnapshot) => {
  const payload = snapshotPayload(snapshot.payload);
  return typeof payload.mode === 'string' ? payload.mode : 'actual';
};

export const fxResponseFields = (fx: PerformanceFxMeta) => {
  if (!fx.estimated) return {};
  const fxAsOf = fx.fxAsOf ?? fx.asOf;
  return {
    estimated: true,
    ...(fx.conversionMode ? { conversionMode: fx.conversionMode } : {}),
    ...(fxAsOf ? { fxAsOf } : {}),
    fxStale: fx.fxStale ?? fx.stale ?? false,
  };
};
