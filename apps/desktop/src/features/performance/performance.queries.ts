import { useQuery } from '@tanstack/react-query';
import { normalizeAllocationCategory, normalizeAllocationTargets } from '@thesis-ledger/domain';
import {
  fetchPerformanceAllocation,
  fetchPerformanceHistory,
  fetchPerformanceLayers,
  fetchPerformanceSummary,
  fetchPerformanceTargets,
} from './performance.api.js';
import type {
  PerformanceAllocationInput,
  PerformanceAllocationResponse,
  PerformanceDataQuality,
  PortfolioMode,
} from './performance.types.js';

const performanceRoot = ['desktop', 'performance'] as const;

export const performanceKeys = {
  root: performanceRoot,
  history: (mode: PortfolioMode, accountId: string) =>
    [...performanceKeys.root, 'history', mode, accountId] as const,
  summary: (mode: PortfolioMode, accountId: string) =>
    [...performanceKeys.root, 'summary', mode, accountId] as const,
  layers: (mode: PortfolioMode, accountId: string) =>
    [...performanceKeys.root, 'layers', mode, accountId] as const,
  targets: (accountId: string) => [...performanceKeys.root, 'targets', accountId] as const,
  allocationRoot: [...performanceRoot, 'allocation'] as const,
  allocation: (mode: PortfolioMode, accountId: string, positionsKey: string, targetsKey: string) =>
    [...performanceKeys.root, 'allocation', mode, accountId, positionsKey, targetsKey] as const,
};

const stableObjectKey = (values: Record<string, number>) =>
  JSON.stringify(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));

const stablePositionsKey = (positions: PerformanceAllocationInput['positions']) =>
  JSON.stringify([...positions].sort((left, right) => left.category.localeCompare(right.category)));

const emptyAllocation = (
  partial: boolean,
  missingSymbols: string[],
): PerformanceAllocationResponse => ({
  allocation: [],
  rebalance: [],
  partial,
  missingSymbols,
});

export const usePerformanceQueries = (mode: PortfolioMode, accountId: string, enabled = true) => {
  const history = useQuery({
    queryKey: performanceKeys.history(mode, accountId),
    queryFn: () => fetchPerformanceHistory(mode, accountId || undefined),
    enabled,
  });
  const summary = useQuery({
    queryKey: performanceKeys.summary(mode, accountId),
    queryFn: () => fetchPerformanceSummary(mode, accountId || undefined),
    enabled,
  });
  const layers = useQuery({
    queryKey: performanceKeys.layers(mode, accountId),
    queryFn: () => fetchPerformanceLayers(mode, accountId || undefined),
    enabled,
  });
  const targets = useQuery({
    queryKey: performanceKeys.targets(accountId),
    queryFn: () => fetchPerformanceTargets(accountId || undefined),
    enabled,
  });

  const selectedTotal = accountId
    ? (layers.data?.account ?? []).find((item) => item.accountId === accountId)
    : layers.data?.portfolio;
  const baseQuality: PerformanceDataQuality = {
    partial: layers.data?.dataQuality?.partial === true || selectedTotal?.partial === true,
    missingSymbols: [
      ...(layers.data?.dataQuality?.missingSymbols ?? []),
      ...(selectedTotal?.missingSymbols ?? []),
    ],
  };
  const positions: PerformanceAllocationInput['positions'] = [];
  const unknownSymbols: string[] = [];
  for (const position of layers.data?.security ?? []) {
    if (position.marketValue === null) continue;
    if (position.assetType.toLowerCase() === 'cash') {
      unknownSymbols.push(position.symbol);
      continue;
    }
    const category = normalizeAllocationCategory(position.assetType);
    if (!category) {
      unknownSymbols.push(position.symbol);
      continue;
    }
    if (accountId && position.accountId !== accountId) continue;
    positions.push({ category, marketValue: position.marketValue });
  }
  const targetNormalization = normalizeAllocationTargets(targets.data?.targets);
  const targetsValue = targetNormalization.targets;
  const cashValue = selectedTotal?.cashValue ?? 0;
  if (cashValue !== 0 || targetsValue.cash !== undefined) {
    positions.push({ category: 'cash', marketValue: cashValue });
  }
  const quality: PerformanceDataQuality = {
    partial:
      baseQuality.partial || unknownSymbols.length > 0 || targetNormalization.unknown.length > 0,
    missingSymbols: [
      ...new Set([
        ...baseQuality.missingSymbols,
        ...unknownSymbols,
        ...targetNormalization.unknown.map((category) => `配置类别:${category}`),
      ]),
    ],
  };
  const loadedPositionsKey = stablePositionsKey(positions);
  const loadedTargetsKey = stableObjectKey(targetsValue);
  const allocation = useQuery({
    queryKey: performanceKeys.allocation(mode, accountId, loadedPositionsKey, loadedTargetsKey),
    queryFn: () => {
      if (positions.length === 0) {
        return Promise.resolve(emptyAllocation(quality.partial, quality.missingSymbols));
      }
      return fetchPerformanceAllocation({
        positions,
        ...(Object.keys(targetsValue).length > 0 ? { targets: targetsValue } : {}),
        dataQuality: quality,
      });
    },
    enabled: enabled && layers.data !== undefined && targets.isFetched,
  });
  return { history, summary, layers, targets, allocation, quality };
};
