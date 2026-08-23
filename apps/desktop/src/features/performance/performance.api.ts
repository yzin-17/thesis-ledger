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
  requestDesktopJson<SnapshotRecord[]>(
    `/performance/history${accountQuery(mode, accountId)}`,
    noStore,
    client,
  );

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
  requestDesktopJson<PerformanceLayersResponse>(
    `/performance/layers${accountQuery(mode, accountId)}`,
    noStore,
    client,
  );

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
