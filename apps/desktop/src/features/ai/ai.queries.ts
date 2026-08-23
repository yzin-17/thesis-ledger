import { useQuery } from '@tanstack/react-query';
import { fetchAiRuns } from './ai.api.js';
import type { LoadState } from '../shared/types.js';

export const aiKeys = {
  root: ['desktop', 'ai'] as const,
  runs: () => [...aiKeys.root, 'runs'] as const,
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

export const useAiRunsQuery = () =>
  useQuery({
    queryKey: aiKeys.runs(),
    queryFn: () => fetchAiRuns(),
    staleTime: 15_000,
  });
