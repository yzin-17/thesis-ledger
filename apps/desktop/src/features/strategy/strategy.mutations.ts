import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  cancelBacktest,
  cancelBacktestV2,
  createStrategy,
  createStrategyVersion,
  fetchStrategyBars,
  queueBacktest,
  runBacktest,
  runBacktestV2,
  retryBacktestV2,
} from './strategy.api.js';
import { strategyKeys } from './strategy.queries.js';
import type {
  CreateStrategyInput,
  CreateStrategyVersionInput,
  FetchStrategyBarsInput,
  QueueBacktestInput,
  QueueBacktestV2Input,
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
    mutationFn: (input: QueueBacktestInput | QueueBacktestV2Input) => queueBacktest(input),
    onSuccess: () => invalidateStrategyData(queryClient),
  });
};

export const useFetchStrategyBarsMutation = () =>
  useMutation({
    mutationFn: (input: FetchStrategyBarsInput) => fetchStrategyBars(input),
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

export const useRunBacktestV2Mutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => runBacktestV2(runId),
    onSuccess: () => invalidateStrategyData(queryClient),
  });
};

export const useCancelBacktestV2Mutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => cancelBacktestV2(runId),
    onSuccess: () => invalidateStrategyData(queryClient),
  });
};

export const useRetryBacktestV2Mutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => retryBacktestV2(runId),
    onSuccess: () => invalidateStrategyData(queryClient),
  });
};
