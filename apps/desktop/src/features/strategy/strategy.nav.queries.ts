import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BacktestNavPreparationRequestV3,
  BacktestNavRunCreateV3,
  BacktestNavRunSummaryV3,
} from '@thesis-ledger/schemas';
import {
  cancelNavBacktestRun,
  createNavBacktestRun,
  fetchNavBacktestRuns,
  fetchNavBacktestRun,
  prepareNavBacktestRun,
  retryNavBacktestRun,
} from './strategy.nav.api.js';

export const navBacktestKeys = {
  root: ['desktop', 'strategy', 'nav-backtests'] as const,
  runs: () => [...navBacktestKeys.root, 'runs'] as const,
  run: (runId: string | null) => [...navBacktestKeys.root, 'run', runId ?? 'closed'] as const,
};

const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled']);
const activeStatuses = new Set(['queued', 'running']);

export const navRunDetailRefetchInterval = (run: unknown) => {
  if (!run || typeof run !== 'object' || !('status' in run)) return false;
  return terminalStatuses.has(String((run as { status?: unknown }).status)) ? false : 5_000;
};

export const navRunListRefetchInterval = (runs: unknown) => {
  if (!Array.isArray(runs)) return false;
  const hasActiveRun = runs.some((run: unknown) => {
    if (!run || typeof run !== 'object' || !('status' in run)) return false;
    return activeStatuses.has(String((run as { status?: unknown }).status));
  });
  return hasActiveRun ? 5_000 : false;
};

export const usePrepareNavBacktestMutation = () =>
  useMutation({ mutationFn: (input: BacktestNavPreparationRequestV3) => prepareNavBacktestRun(input) });

export const useCreateNavBacktestMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BacktestNavRunCreateV3) => createNavBacktestRun(input),
    onSuccess: (run) => {
      queryClient.setQueryData(navBacktestKeys.run(run.id), run);
      void queryClient.invalidateQueries({ queryKey: navBacktestKeys.root });
    },
  });
};

export const useNavBacktestRunsQuery = () =>
  useQuery<BacktestNavRunSummaryV3[]>({
    queryKey: navBacktestKeys.runs(),
    queryFn: () => fetchNavBacktestRuns(),
    refetchInterval: (query) => navRunListRefetchInterval(query.state.data),
  });

export const useNavBacktestRunQuery = (runId: string | null) =>
  useQuery({
    queryKey: navBacktestKeys.run(runId),
    queryFn: () => fetchNavBacktestRun(runId ?? ''),
    enabled: Boolean(runId),
    refetchInterval: (query) => navRunDetailRefetchInterval(query.state.data),
  });

export const useCancelNavBacktestMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => cancelNavBacktestRun(runId),
    onSuccess: (run) => {
      queryClient.setQueryData(navBacktestKeys.run(run.id), run);
      void queryClient.invalidateQueries({ queryKey: navBacktestKeys.root });
    },
  });
};

export const useRetryNavBacktestMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => retryNavBacktestRun(runId),
    onSuccess: (run) => {
      queryClient.setQueryData(navBacktestKeys.run(run.id), run);
      void queryClient.invalidateQueries({ queryKey: navBacktestKeys.root });
    },
  });
};
