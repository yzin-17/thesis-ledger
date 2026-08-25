import { useQuery } from '@tanstack/react-query';
import {
  fetchAiCapabilities,
  fetchAiRun,
  fetchAiRuns,
  fetchAiToolCalls,
  type AiRunListFilter,
} from './ai.api.js';
import type { AiRunRecord } from './ai.types.js';
import type { LoadState } from '../shared/types.js';

export const aiKeys = {
  root: ['desktop', 'ai'] as const,
  runs: (filter: AiRunListFilter = {}) =>
    [
      ...aiKeys.root,
      'runs',
      filter.status ?? 'all',
      filter.limit ?? 50,
      filter.cursor ?? '',
    ] as const,
  run: (id: string) => [...aiKeys.root, 'run', id] as const,
  toolCalls: (id: string, cursor = '') => [...aiKeys.root, 'tool-calls', id, cursor] as const,
  capabilities: () => [...aiKeys.root, 'capabilities'] as const,
};

const pollingStatuses = new Set(['queued', 'running']);

export const isAiRunTerminal = (status: unknown) => !pollingStatuses.has(String(status));

export const shouldPollAiRuns = (runs: unknown) => {
  let items: unknown[] = [];
  if (Array.isArray(runs)) items = runs;
  else if (runs && typeof runs === 'object' && 'items' in runs && Array.isArray(runs.items))
    items = runs.items;
  return items.some((run: unknown) => {
    if (!run || typeof run !== 'object' || !('status' in run)) return false;
    return pollingStatuses.has(String((run as { status?: unknown }).status));
  });
};

export const resolveAiRunsLoadState = (snapshot: {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  hasRuns: boolean;
}): LoadState => {
  if (snapshot.isError) return snapshot.hasRuns ? 'stale' : 'error';
  if (snapshot.isPending) return 'loading';
  if (snapshot.isSuccess) return snapshot.hasRuns ? 'ready' : 'empty';
  return 'loading';
};

export const useAiRunsQuery = (filter: AiRunListFilter = {}) =>
  useQuery({
    queryKey: aiKeys.runs(filter),
    queryFn: () => fetchAiRuns(filter),
    staleTime: 5_000,
    refetchInterval: (query) => (shouldPollAiRuns(query.state.data) ? 1_500 : false),
  });

export const useAiRunQuery = (id: string | null) =>
  useQuery({
    queryKey: aiKeys.run(id ?? ''),
    queryFn: () => fetchAiRun(id ?? ''),
    enabled: Boolean(id),
    staleTime: 1_000,
    refetchInterval: (query) =>
      query.state.data && !isAiRunTerminal(query.state.data.status) ? 1_500 : false,
  });

export const useAiToolCallsQuery = (
  id: string | null,
  enabled = false,
  filter: { limit?: number; cursor?: string } = {},
) =>
  useQuery({
    queryKey: aiKeys.toolCalls(id ?? '', filter.cursor),
    queryFn: () => fetchAiToolCalls(id ?? '', filter),
    enabled: Boolean(id) && enabled,
    staleTime: 5_000,
  });

export const useAiCapabilitiesQuery = (enabled = true) =>
  useQuery({
    queryKey: aiKeys.capabilities(),
    queryFn: () => fetchAiCapabilities(),
    enabled,
    staleTime: 30_000,
  });

export const findAiRun = (runs: AiRunRecord[], id: string | null) =>
  (id ? runs.find((run) => run.id === id) : undefined) ?? null;
