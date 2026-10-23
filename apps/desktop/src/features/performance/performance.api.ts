import { parsedDesktopRequest, type DesktopRequestClient } from '../shared/request.js';
import { performanceClient } from '@thesis-ledger/api-client';
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
  PerformanceSeriesInterval,
  PerformanceSeriesPoint,
  PerformanceSeriesRange,
  PerformanceSeriesResponse,
  SavePerformanceTargetsInput,
  SnapshotRecord,
} from './performance.types.js';

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

const seriesPoint = (value: unknown): PerformanceSeriesPoint => {
  const record = asRecord(value);
  const basis = record.valuationBasis === 'OFFICIAL' ? 'OFFICIAL' : 'ESTIMATED';
  const quality = record.dataQuality;
  const dataQuality =
    quality === 'PARTIAL' || quality === 'LOW_COVERAGE' || quality === 'UNAVAILABLE'
      ? quality
      : 'COMPLETE';
  return {
    at: stringValue(record.at, ''),
    value: numberValue(record.value),
    currency: currencyValue(record.currency) ?? 'CNY',
    valuationBasis: basis,
    disclosureCoverage: numberValue(record.disclosureCoverage),
    pricedCoverage: numberValue(record.pricedCoverage),
    dataQuality,
    sourceSnapshotId: typeof record.sourceSnapshotId === 'string' ? record.sourceSnapshotId : null,
  };
};

const seriesResponse = (
  value: unknown,
  requestedRange: PerformanceSeriesRange,
  requestedInterval: PerformanceSeriesInterval,
): PerformanceSeriesResponse => {
  const record = asRecord(value);
  const intervalValues = new Set<PerformanceSeriesInterval>([
    '1min',
    '1h',
    '1d',
    '1w',
    '1mo',
    '1y',
  ]);
  const availableIntervals = Array.isArray(record.availableIntervals)
    ? record.availableIntervals.filter(
        (item): item is PerformanceSeriesInterval =>
          typeof item === 'string' && intervalValues.has(item as PerformanceSeriesInterval),
      )
    : [];
  const defaultInterval = intervalValues.has(record.defaultInterval as PerformanceSeriesInterval)
    ? (record.defaultInterval as PerformanceSeriesInterval)
    : requestedInterval;
  const points = Array.isArray(record.points) ? record.points.map(seriesPoint) : [];
  const quality = record.dataQuality;
  return {
    range: requestedRange,
    interval: requestedInterval,
    currency: currencyValue(record.currency) ?? 'CNY',
    availableIntervals,
    defaultInterval,
    dataQuality:
      quality === 'PARTIAL' || quality === 'LOW_COVERAGE' || quality === 'UNAVAILABLE'
        ? quality
        : 'COMPLETE',
    historyStart: typeof record.historyStart === 'string' ? record.historyStart : null,
    points,
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

const queryOptions = (
  mode: PortfolioMode,
  accountId: string | undefined,
  options: PerformanceQueryOptions,
) => ({
  mode,
  ...(accountId ? { accountId } : {}),
  ...(options.fxMerge || options.baseCurrency !== 'CNY'
    ? { fxMerge: options.fxMerge, baseCurrency: options.baseCurrency }
    : {}),
});

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
  return performanceClient(parsedDesktopRequest(resolved.client))
    .getHistory(queryOptions(mode, accountId, resolved.options))
    .then((records) => records.map(snapshotRecord));
}
export function fetchPerformanceSeries(
  mode: PortfolioMode,
  accountId: string | undefined,
  range: PerformanceSeriesRange,
  interval: PerformanceSeriesInterval,
  baseCurrency: Currency,
  client?: DesktopRequestClient,
) {
  return performanceClient(parsedDesktopRequest(client))
    .getSeries({
      scope: accountId ? 'account' : 'portfolio',
      mode,
      range,
      interval,
      baseCurrency,
      ...(accountId ? { accountId } : {}),
    })
    .then((value) => seriesResponse(value, range, interval));
}
export function fetchPerformanceSummary(
  mode: PortfolioMode,
  accountId?: string,
  clientOrOptions?: DesktopRequestClient | PerformanceQueryOptions,
  client?: DesktopRequestClient,
): Promise<PerformanceSummary> {
  const resolved = resolveQueryArgs(clientOrOptions, client);
  return performanceClient(parsedDesktopRequest(resolved.client))
    .getSummary(queryOptions(mode, accountId, resolved.options))
    .then((value) => ({
      ttwror: value.ttwror,
      xirr: value.xirr,
      ...(value.ttwrorReason !== undefined ? { ttwrorReason: value.ttwrorReason } : {}),
      ...(value.xirrReason !== undefined ? { xirrReason: value.xirrReason } : {}),
      ...(value.currency ? { currency: value.currency } : {}),
      ...(value.fx ? { fx: fxMeta(value.fx) } : {}),
      ...(Array.isArray(value.fxEvidence) ? { fxEvidence: value.fxEvidence.map(fxMeta) } : {}),
      ...(typeof value.estimated === 'boolean' ? { estimated: value.estimated } : {}),
      ...(value.conversionMode === 'current-rate' || value.conversionMode === 'historical-rate'
        ? { conversionMode: value.conversionMode }
        : {}),
      ...(typeof value.fxAsOf === 'string' ? { fxAsOf: value.fxAsOf } : {}),
      ...(typeof value.fxStale === 'boolean' ? { fxStale: value.fxStale } : {}),
    }));
}
export function fetchPerformanceLayers(
  mode: PortfolioMode,
  accountId?: string,
  clientOrOptions?: DesktopRequestClient | PerformanceQueryOptions,
  client?: DesktopRequestClient,
): Promise<PerformanceLayersResponse> {
  const resolved = resolveQueryArgs(clientOrOptions, client);
  return performanceClient(parsedDesktopRequest(resolved.client))
    .getLayers(queryOptions(mode, accountId, resolved.options))
    .then(layersResponse);
}
export const fetchPerformanceTargets = (
  mode: PortfolioMode,
  accountId?: string,
  options: PerformanceQueryOptions = defaultPerformanceQueryOptions,
  client?: DesktopRequestClient,
): Promise<PerformanceTargetsResponse> =>
  performanceClient(parsedDesktopRequest(client))
    .getTargets(queryOptions(mode, accountId, options))
    .then((value) => ({
      scope: value.scope,
      accountId: value.accountId,
      targets: value.targets,
      ...(value.version !== undefined ? { version: value.version } : {}),
      ...(value.source ? { source: value.source } : {}),
      ...(value.createdAt ? { createdAt: value.createdAt } : {}),
      ...(value.aggregatedAccountCount !== undefined
        ? { aggregatedAccountCount: value.aggregatedAccountCount }
        : {}),
      ...(value.aggregationUnavailableReason
        ? { aggregationUnavailableReason: value.aggregationUnavailableReason }
        : {}),
    }));
export const fetchPerformanceAllocation = (
  input: PerformanceAllocationInput,
  client?: DesktopRequestClient,
): Promise<PerformanceAllocationResponse> =>
  performanceClient(parsedDesktopRequest(client))
    .allocate(input)
    .then((value) => ({
      allocation: value.allocation,
      rebalance: value.rebalance,
      partial: value.partial,
      missingSymbols: value.missingSymbols,
      ...(value.fx ? { fx: fxMeta(value.fx) } : {}),
    }));
export const savePerformanceTargets = (
  input: SavePerformanceTargetsInput,
  client?: DesktopRequestClient,
) => performanceClient(parsedDesktopRequest(client)).saveTargets(input);
