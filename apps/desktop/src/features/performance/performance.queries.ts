import { useQuery } from '@tanstack/react-query';
import {
  fetchPerformanceAllocation,
  fetchPerformanceHistory,
  fetchPerformanceLayers,
  fetchPerformanceSummary,
  fetchPerformanceTargets,
} from './performance.api.js';
import type { PerformanceAllocationInput, PortfolioMode } from './performance.types.js';

export const performanceKeys = {
  root: ['desktop', 'performance'] as const,
  history: (mode: PortfolioMode, accountId: string) =>
    [...performanceKeys.root, 'history', mode, accountId] as const,
  summary: (mode: PortfolioMode, accountId: string) =>
    [...performanceKeys.root, 'summary', mode, accountId] as const,
  layers: (mode: PortfolioMode, accountId: string) =>
    [...performanceKeys.root, 'layers', mode, accountId] as const,
  targets: (accountId: string) => [...performanceKeys.root, 'targets', accountId] as const,
  allocation: (mode: PortfolioMode, accountId: string, positionsKey: string, targetsKey: string) =>
    [...performanceKeys.root, 'allocation', mode, accountId, positionsKey, targetsKey] as const,
};

const targetKey = (targets: Record<string, number>) =>
  JSON.stringify(targets, Object.keys(targets).sort());

const positionsKey = (positions: PerformanceAllocationInput['positions']) =>
  JSON.stringify(positions);

export const usePerformanceQueries = (mode: PortfolioMode, accountId: string) => {
  const history = useQuery({
    queryKey: performanceKeys.history(mode, accountId),
    queryFn: () => fetchPerformanceHistory(mode, accountId || undefined),
  });
  const summary = useQuery({
    queryKey: performanceKeys.summary(mode, accountId),
    queryFn: () => fetchPerformanceSummary(mode, accountId || undefined),
  });
  const layers = useQuery({
    queryKey: performanceKeys.layers(mode, accountId),
    queryFn: () => fetchPerformanceLayers(mode, accountId || undefined),
  });
  const targets = useQuery({
    queryKey: performanceKeys.targets(accountId),
    queryFn: () => fetchPerformanceTargets(accountId || undefined),
  });
  const loadedTargets = targets.data?.targets ?? {};
  const positions: PerformanceAllocationInput['positions'] = (layers.data?.security ?? [])
    .filter((position) => position.marketValue !== null)
    .map((position) => ({
      category: position.assetType,
      marketValue: position.marketValue as number,
    }));
  const loadedPositionsKey = positionsKey(positions);
  const loadedTargetsKey = targetKey(loadedTargets);
  const allocation = useQuery({
    queryKey: performanceKeys.allocation(mode, accountId, loadedPositionsKey, loadedTargetsKey),
    queryFn: () =>
      positions.length === 0
        ? Promise.resolve({ allocation: [], rebalance: [] })
        : fetchPerformanceAllocation({
            positions,
            ...(Object.keys(loadedTargets).length > 0 ? { targets: loadedTargets } : {}),
          }),
    enabled: layers.data !== undefined,
  });
  return { history, summary, layers, targets, allocation };
};
