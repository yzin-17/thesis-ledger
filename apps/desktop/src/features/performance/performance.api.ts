import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type {
  PerformanceAllocationInput,
  PerformanceAllocationResponse,
  PerformanceAccountTotal,
  PerformanceLayerRecord,
  PerformanceLayersResponse,
  PerformanceFxMeta,
  PerformancePortfolioTotal,
  PerformanceSummary,
  Currency,
  PerformanceTargetsResponse,
  PortfolioMode,
  PerformanceQueryOptions,
  SavePerformanceTargetsInput,
  CaptureCloseSnapshotsInput,
  SnapshotRecord,
} from './performance.types.js';

const noStore = { cache: 'no-store' as const };
const defaultPerformanceQueryOptions: PerformanceQueryOptions = {
  fxMerge: false,
  baseCurrency: 'CNY',
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const stringValue = (value: unknown, fallback: string) => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return fallback;
};

const currencyValue = (value: unknown): Currency | undefined =>
  value === 'CNY' || value === 'HKD' || value === 'USD' ? value : undefined;

const fxMeta = (value: unknown): PerformanceFxMeta => {
  const record = asRecord(value);
  const status = record.status;
  const rates = Array.isArray(record.rates) ? record.rates : [];
  const result: PerformanceFxMeta = {
    enabled: record.enabled === true,
    status:
      status === 'ready' || status === 'stale' || status === 'blocked' || status === 'not_needed'
        ? status
        : 'disabled',
    missingCurrencies: Array.isArray(record.missingCurrencies)
      ? record.missingCurrencies
          .map(currencyValue)
          .filter((item): item is NonNullable<typeof item> => item !== undefined)
      : [],
    rates: rates.map((item): PerformanceFxMeta['rates'][number] => {
      const rate = asRecord(item);
      const freshness = rate.freshness;
      const mapped: PerformanceFxMeta['rates'][number] = {
        fromCurrency: currencyValue(rate.fromCurrency) ?? 'CNY',
        toCurrency: currencyValue(rate.toCurrency) ?? 'CNY',
        freshness:
          freshness === 'live' || freshness === 'delayed' || freshness === 'stale'
            ? freshness
            : 'unavailable',
        stale: rate.stale === true,
        ageDays: typeof rate.ageDays === 'number' ? rate.ageDays : null,
        available: rate.available === true,
      };
      if (typeof rate.rate === 'number') mapped.rate = rate.rate;
      if (typeof rate.rateDate === 'string') mapped.rateDate = rate.rateDate;
      if (typeof rate.provider === 'string') mapped.provider = rate.provider;
      if (typeof rate.fetchedAt === 'string') mapped.fetchedAt = rate.fetchedAt;
      return mapped;
    }),
  };
  if (typeof record.version === 'number') result.version = record.version;
  if (typeof record.evidenceVersion === 'string') result.evidenceVersion = record.evidenceVersion;
  const baseCurrency = currencyValue(record.baseCurrency);
  if (baseCurrency) result.baseCurrency = baseCurrency;
  if (typeof record.asOf === 'string') result.asOf = record.asOf;
  if (typeof record.fxAsOf === 'string') result.fxAsOf = record.fxAsOf;
  if (record.estimated === true) result.estimated = true;
  if (record.conversionMode === 'current-rate' || record.conversionMode === 'historical-rate')
    result.conversionMode = record.conversionMode;
  if (record.stale === true) result.stale = true;
  if (record.fxStale === true) result.fxStale = true;
  return result;
};

const snapshotRecord = (value: unknown): SnapshotRecord => {
  const record = asRecord(value);
  const payload = asRecord(record.payload);
  const quality = asRecord(payload.dataQuality);
  const directMissing = Array.isArray(payload.missingSymbols) ? payload.missingSymbols : undefined;
  const qualityMissing = Array.isArray(quality.missingSymbols) ? quality.missingSymbols : [];
  const missingSymbols = (directMissing ?? qualityMissing).map(String);
  const currency = currencyValue(record.currency);
  return {
    id: stringValue(record.id, stringValue(record.capturedAt, 'snapshot')),
    capturedAt: stringValue(record.capturedAt, ''),
    marketValue: numberValue(record.marketValue),
    costValue: numberValue(record.costValue),
    cashValue: numberValue(record.cashValue),
    partial: payload.partial === true || quality.partial === true,
    missingSymbols,
    ...(currency ? { currency } : {}),
  };
};

const layersResponse = (value: unknown): PerformanceLayersResponse => {
  const record = asRecord(value);
  const security = Array.isArray(record.security)
    ? record.security.map((item) => {
        const layer = asRecord(item);
        const marketValue =
          layer.marketValue === null || layer.marketValue === undefined
            ? null
            : numberValue(layer.marketValue);
        const costValue = numberValue(layer.costValue);
        const mapped: Omit<PerformanceLayerRecord, 'currency'> = {
          accountId: stringValue(layer.accountId, ''),
          symbol: stringValue(layer.symbol, ''),
          assetType: stringValue(layer.assetType, ''),
          costValue,
          marketValue,
          unrealizedPnl: marketValue === null ? null : numberValue(layer.unrealizedPnl),
          nativeCostValue: numberValue(layer.nativeCostValue),
          nativeMarketValue:
            layer.nativeMarketValue === null || layer.nativeMarketValue === undefined
              ? null
              : numberValue(layer.nativeMarketValue),
        };
        const currency = currencyValue(layer.currency);
        return currency ? { ...mapped, currency } : mapped;
      })
    : [];
  const account = Array.isArray(record.account)
    ? record.account.map((item) => {
        const total = asRecord(item);
        const missingSymbols = Array.isArray(total.missingSymbols)
          ? total.missingSymbols.map(String)
          : [];
        const mapped: Omit<PerformanceAccountTotal, 'currency'> = {
          accountId: stringValue(total.accountId, ''),
          marketValue: numberValue(total.marketValue),
          costValue: numberValue(total.costValue),
          cashValue: numberValue(total.cashValue),
          partial: total.partial === true,
          missingSymbols,
          nativeCostValue: numberValue(total.nativeCostValue),
          nativeMarketValue: numberValue(total.nativeMarketValue),
          nativeCashValue: numberValue(total.nativeCashValue),
        };
        const currency = currencyValue(total.currency);
        return currency ? { ...mapped, currency } : mapped;
      })
    : [];
  const portfolioRecord = record.portfolio === null ? null : asRecord(record.portfolio);
  const portfolioMissingSymbols = Array.isArray(portfolioRecord?.missingSymbols)
    ? portfolioRecord.missingSymbols.map(String)
    : [];
  const qualityRecord = asRecord(record.dataQuality);
  const securityMissingSymbols = security
    .filter((layer) => layer.marketValue === null)
    .map((layer) => layer.symbol);
  let missingSymbols = securityMissingSymbols;
  if (Array.isArray(qualityRecord.missingSymbols)) {
    missingSymbols = qualityRecord.missingSymbols.map(String);
  } else if (portfolioMissingSymbols.length > 0) {
    missingSymbols = portfolioMissingSymbols;
  }
  const portfolio = portfolioRecord
    ? (() => {
        const mapped: Omit<PerformancePortfolioTotal, 'currency'> = {
          marketValue: numberValue(portfolioRecord.marketValue),
          costValue: numberValue(portfolioRecord.costValue),
          cashValue: numberValue(portfolioRecord.cashValue),
          partial: portfolioRecord.partial === true || qualityRecord.partial === true,
          missingSymbols: portfolioMissingSymbols,
          nativeCostValue: numberValue(portfolioRecord.nativeCostValue),
          nativeMarketValue: numberValue(portfolioRecord.nativeMarketValue),
          nativeCashValue: numberValue(portfolioRecord.nativeCashValue),
        };
        const currency = currencyValue(portfolioRecord.currency);
        return currency ? { ...mapped, currency } : mapped;
      })()
    : null;
  const byCurrency = Array.isArray(record.byCurrency)
    ? record.byCurrency.map((item) => {
        const total = asRecord(item);
        const mapped: Omit<PerformancePortfolioTotal, 'currency'> = {
          marketValue: numberValue(total.marketValue),
          costValue: numberValue(total.costValue),
          cashValue: numberValue(total.cashValue),
          partial: total.partial === true,
          missingSymbols: Array.isArray(total.missingSymbols)
            ? total.missingSymbols.map(String)
            : [],
          nativeCostValue: numberValue(total.nativeCostValue),
          nativeMarketValue: numberValue(total.nativeMarketValue),
          nativeCashValue: numberValue(total.nativeCashValue),
        };
        const currency = currencyValue(total.currency);
        return currency ? { ...mapped, currency } : mapped;
      })
    : [];
  return {
    security,
    account,
    portfolio,
    byCurrency,
    valuedAt: stringValue(record.valuedAt, ''),
    dataQuality: {
      partial:
        qualityRecord.partial === true ||
        portfolioRecord?.partial === true ||
        securityMissingSymbols.length > 0 ||
        missingSymbols.length > 0,
      missingSymbols,
      missingCurrencies: Array.isArray(qualityRecord.missingCurrencies)
        ? qualityRecord.missingCurrencies
            .map(currencyValue)
            .filter((item): item is NonNullable<typeof item> => item !== undefined)
        : [],
    },
    fx: fxMeta(record.fx),
  };
};

const accountQuery = (
  mode: PortfolioMode,
  accountId: string | undefined,
  options: PerformanceQueryOptions,
) => {
  const params = new URLSearchParams({ mode });
  if (accountId) params.set('accountId', accountId);
  if (options.fxMerge || options.baseCurrency !== 'CNY') {
    params.set('fxMerge', String(options.fxMerge));
    params.set('baseCurrency', options.baseCurrency);
  }
  return `?${params.toString()}`;
};

const isRequestClient = (value: unknown): value is DesktopRequestClient =>
  Boolean(value && typeof value === 'object' && 'request' in value);

const resolveQueryArgs = (
  clientOrOptions: DesktopRequestClient | PerformanceQueryOptions | undefined,
  client: DesktopRequestClient | undefined,
) => {
  if (isRequestClient(clientOrOptions)) {
    return { client: clientOrOptions, options: defaultPerformanceQueryOptions };
  }
  return { client, options: clientOrOptions ?? defaultPerformanceQueryOptions };
};

export function fetchPerformanceHistory(
  mode: PortfolioMode,
  accountId?: string,
  clientOrOptions?: DesktopRequestClient | PerformanceQueryOptions,
  client?: DesktopRequestClient,
) {
  const resolved = resolveQueryArgs(clientOrOptions, client);
  return requestDesktopJson<unknown[]>(
    `/performance/history${accountQuery(mode, accountId, resolved.options)}`,
    noStore,
    resolved.client,
  ).then((records) => records.map(snapshotRecord));
}

export function fetchPerformanceSummary(
  mode: PortfolioMode,
  accountId?: string,
  clientOrOptions?: DesktopRequestClient | PerformanceQueryOptions,
  client?: DesktopRequestClient,
): Promise<PerformanceSummary> {
  const resolved = resolveQueryArgs(clientOrOptions, client);
  return requestDesktopJson<PerformanceSummary>(
    `/performance/summary${accountQuery(mode, accountId, resolved.options)}`,
    noStore,
    resolved.client,
  );
}

export function fetchPerformanceLayers(
  mode: PortfolioMode,
  accountId?: string,
  clientOrOptions?: DesktopRequestClient | PerformanceQueryOptions,
  client?: DesktopRequestClient,
): Promise<PerformanceLayersResponse> {
  const resolved = resolveQueryArgs(clientOrOptions, client);
  return requestDesktopJson<unknown>(
    `/performance/layers${accountQuery(mode, accountId, resolved.options)}`,
    noStore,
    resolved.client,
  ).then(layersResponse);
}

export const fetchPerformanceTargets = (
  mode: PortfolioMode,
  accountId?: string,
  options: PerformanceQueryOptions = defaultPerformanceQueryOptions,
  client?: DesktopRequestClient,
) => {
  const params = new URLSearchParams({
    scope: accountId ? 'account' : 'portfolio',
    mode,
  });
  if (accountId) params.set('accountId', accountId);
  if (options.fxMerge || options.baseCurrency !== 'CNY') {
    params.set('fxMerge', String(options.fxMerge));
    params.set('baseCurrency', options.baseCurrency);
  }
  return requestDesktopJson<PerformanceTargetsResponse>(
    `/performance/targets?${params.toString()}`,
    noStore,
    client,
  );
};

export const fetchPerformanceAllocation = (
  input: PerformanceAllocationInput,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<PerformanceAllocationResponse>(
    '/performance/allocation',
    {
      ...noStore,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );

export const savePerformanceTargets = (
  input: SavePerformanceTargetsInput,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<unknown>(
    '/performance/targets',
    {
      ...noStore,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );

export const captureCloseSnapshots = (
  input: CaptureCloseSnapshotsInput,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<{ capturedAt: string; snapshots: unknown[] }>(
    '/automations/workflows/close-snapshots',
    {
      ...noStore,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );
