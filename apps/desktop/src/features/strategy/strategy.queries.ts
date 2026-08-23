import { useQuery } from '@tanstack/react-query';
import { fetchBacktestJobs, fetchStrategies } from './strategy.api.js';

export const strategyKeys = {
  root: ['desktop', 'strategy'] as const,
  strategies: () => [...strategyKeys.root, 'strategies'] as const,
  jobs: () => [...strategyKeys.root, 'jobs'] as const,
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

export const useStrategyQueries = () => {
  const strategies = useQuery({
    queryKey: strategyKeys.strategies(),
    queryFn: () => fetchStrategies(),
    staleTime: 10_000,
  });
  const jobs = useQuery({
    queryKey: strategyKeys.jobs(),
    queryFn: () => fetchBacktestJobs(),
    staleTime: 5_000,
    refetchInterval: (query) => (shouldPollJobs(query.state.data) ? 1_500 : false),
  });
  return { strategies, jobs };
};
