import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type {
  PerformanceAllocationInput,
  PerformanceAllocationResponse,
  PerformanceLayersResponse,
  PerformanceSummary,
  PerformanceTargetsResponse,
  PortfolioMode,
  SavePerformanceTargetsInput,
  SnapshotRecord,
} from './performance.types.js';

const noStore = { cache: 'no-store' as const };

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

const snapshotRecord = (value: unknown): SnapshotRecord => {
  const record = asRecord(value);
  const payload = asRecord(record.payload);
  const quality = asRecord(payload.dataQuality);
  const directMissing = Array.isArray(payload.missingSymbols) ? payload.missingSymbols : undefined;
  const qualityMissing = Array.isArray(quality.missingSymbols) ? quality.missingSymbols : [];
  const missingSymbols = (directMissing ?? qualityMissing).map(String);
  return {
    id: stringValue(record.id, stringValue(record.capturedAt, 'snapshot')),
    capturedAt: stringValue(record.capturedAt, ''),
    marketValue: numberValue(record.marketValue),
    costValue: numberValue(record.costValue),
    cashValue: numberValue(record.cashValue),
    partial: payload.partial === true || quality.partial === true,
    missingSymbols,
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
        return {
          accountId: stringValue(layer.accountId, ''),
          symbol: stringValue(layer.symbol, ''),
          assetType: stringValue(layer.assetType, ''),
          costValue,
          marketValue,
          unrealizedPnl: marketValue === null ? null : numberValue(layer.unrealizedPnl),
        };
      })
    : [];
  const account = Array.isArray(record.account)
    ? record.account.map((item) => {
        const total = asRecord(item);
        const missingSymbols = Array.isArray(total.missingSymbols)
          ? total.missingSymbols.map(String)
          : [];
        return {
          accountId: stringValue(total.accountId, ''),
          marketValue: numberValue(total.marketValue),
          costValue: numberValue(total.costValue),
          cashValue: numberValue(total.cashValue),
          partial: total.partial === true,
          missingSymbols,
        };
      })
    : [];
  const portfolioRecord = asRecord(record.portfolio);
  const portfolioMissingSymbols = Array.isArray(portfolioRecord.missingSymbols)
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
  return {
    security,
    account,
    portfolio: {
      marketValue: numberValue(portfolioRecord.marketValue),
      costValue: numberValue(portfolioRecord.costValue),
      cashValue: numberValue(portfolioRecord.cashValue),
      partial: portfolioRecord.partial === true || qualityRecord.partial === true,
      missingSymbols: portfolioMissingSymbols,
    },
    valuedAt: stringValue(record.valuedAt, ''),
    dataQuality: {
      partial:
        qualityRecord.partial === true ||
        portfolioRecord.partial === true ||
        securityMissingSymbols.length > 0 ||
        missingSymbols.length > 0,
      missingSymbols,
    },
  };
};

const accountQuery = (mode: PortfolioMode, accountId?: string) => {
  const params = new URLSearchParams({ mode });
  if (accountId) params.set('accountId', accountId);
  return `?${params.toString()}`;
};

export const fetchPerformanceHistory = (
  mode: PortfolioMode,
  accountId?: string,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<unknown[]>(
    `/performance/history${accountQuery(mode, accountId)}`,
    noStore,
    client,
  ).then((records) => records.map(snapshotRecord));

export const fetchPerformanceSummary = (
  mode: PortfolioMode,
  accountId?: string,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<PerformanceSummary>(
    `/performance/summary${accountQuery(mode, accountId)}`,
    noStore,
    client,
  );

export const fetchPerformanceLayers = (
  mode: PortfolioMode,
  accountId?: string,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<unknown>(
    `/performance/layers${accountQuery(mode, accountId)}`,
    noStore,
    client,
  ).then(layersResponse);

export const fetchPerformanceTargets = (accountId?: string, client?: DesktopRequestClient) => {
  const params = new URLSearchParams({ scope: accountId ? 'account' : 'portfolio' });
  if (accountId) params.set('accountId', accountId);
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
