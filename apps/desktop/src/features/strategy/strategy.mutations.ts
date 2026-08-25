import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  cancelBacktest,
  createStrategy,
  createStrategyVersion,
  fetchStrategyBars,
  queueBacktest,
  runBacktest,
} from './strategy.api.js';
import { strategyKeys } from './strategy.queries.js';
import type {
  CreateStrategyInput,
  CreateStrategyVersionInput,
  QueueBacktestInput,
} from './strategy.types.js';

const invalidateStrategyData = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ queryKey: strategyKeys.root });

export const useCreateStrategyMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStrategyInput) => createStrategy(input),
    onSuccess: () => invalidateStrategyData(queryClient),
  });
};

export const useCreateStrategyVersionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStrategyVersionInput) => createStrategyVersion(input),
    onSuccess: () => invalidateStrategyData(queryClient),
  });
};

export const useQueueBacktestMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QueueBacktestInput) => queueBacktest(input),
    onSuccess: () => invalidateStrategyData(queryClient),
  });
};

export const useFetchStrategyBarsMutation = () =>
  useMutation({
    mutationFn: (symbol: string) => fetchStrategyBars(symbol),
  });

export const useRunBacktestMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => runBacktest(jobId),
    onSuccess: () => invalidateStrategyData(queryClient),
  });
};

export const useCancelBacktestMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => cancelBacktest(jobId),
    onSuccess: () => invalidateStrategyData(queryClient),
  });
};
