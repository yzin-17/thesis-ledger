import { useQuery } from '@tanstack/react-query';
import { isBacktestRunUpdateOlder } from '@thesis-ledger/domain';
import { fetchBacktestJob, fetchBacktestJobs, fetchStrategies, fetchBacktestInstrumentSeries } from './strategy.api.js';

export const strategyKeys = {
  root: ['desktop', 'strategy'] as const,
  strategies: () => [...strategyKeys.root, 'strategies'] as const,
  jobs: () => [...strategyKeys.root, 'jobs'] as const,
  groups: () => [...strategyKeys.root, 'backtest-groups'] as const,
  job: (jobId: string) => [...strategyKeys.jobs(), jobId] as const,
  instrument: (jobId: string, snapshotId: string | null | undefined) => [...strategyKeys.job(jobId), 'instrument-series', snapshotId] as const,
};

const terminalJobStatuses = new Set(['succeeded', 'failed', 'cancelled']);

export const shouldPollJobs = (jobs: unknown) => {
  if (!Array.isArray(jobs)) return false;
  return jobs.some((job: unknown) => {
    if (!job || typeof job !== 'object' || !('status' in job)) return false;
    const status = (job as { status?: unknown }).status;
    return !terminalJobStatuses.has(String(status));
  });
};

export const jobFallbackInterval = (jobs: unknown) => (shouldPollJobs(jobs) ? 30_000 : false);

export const jobDetailFallbackInterval = (job: unknown) => {
  if (!job || typeof job !== 'object' || !('status' in job)) return false;
  return terminalJobStatuses.has(String((job as { status?: unknown }).status)) ? false : 30_000;
};

export const useStrategyQueries = () => {
  const strategies = useQuery({
    queryKey: strategyKeys.strategies(),
    queryFn: () => fetchStrategies(),
    staleTime: 10_000,
  });
  const jobs = useQuery({
    queryKey: strategyKeys.jobs(),
    queryFn: ({ signal }) => fetchBacktestJobs(undefined, signal),
    staleTime: 5_000,
    refetchInterval: (query) => jobFallbackInterval(query.state.data),
  });
  return { strategies, jobs };
};

export const useBacktestJobQuery = (jobId: string | null) =>
  useQuery({
    queryKey: strategyKeys.job(jobId ?? 'closed'),
    queryFn: ({ signal }) => fetchBacktestJob(jobId ?? '', undefined, signal),
    structuralSharing: (before, after) => isBacktestRunUpdateOlder(before, after) ? before : after,
    enabled: Boolean(jobId),
    refetchInterval: (query) => jobDetailFallbackInterval(query.state.data),
  });

export const useBacktestInstrumentSeriesQuery = (jobId: string | null, snapshotId: string | null | undefined, enabled: boolean) =>
  useQuery({ queryKey: strategyKeys.instrument(jobId ?? 'closed', snapshotId),
    queryFn: ({ signal }) => fetchBacktestInstrumentSeries(jobId ?? '', signal), enabled: Boolean(jobId) && enabled,
    staleTime: Infinity, retry: false,
  });
