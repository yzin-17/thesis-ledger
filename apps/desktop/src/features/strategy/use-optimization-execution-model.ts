import { useQuery } from '@tanstack/react-query';
import { strategyClients } from '@thesis-ledger/api-client';
import {
  optimizationModelResolutionRequestSchema,
  type OptimizationModelResolutionRequest,
  type BacktestModelResolutionResult,
} from '@thesis-ledger/schemas';
import { parsedDesktopRequest } from '../shared/request.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';

export function useOptimizationExecutionModel(input: OptimizationModelResolutionRequest) {
  const parsed = optimizationModelResolutionRequestSchema.safeParse(input);
  const query = useQuery<BacktestModelResolutionResult>({
    queryKey: ['desktop', 'optimization-execution-model', input],
    enabled: parsed.success,
    queryFn: ({ signal }) => {
      if (!parsed.success) throw new Error('请核对实验标的与日期区间。');
      return strategyClients(parsedDesktopRequest()).optimization.resolveExecutionModel(
        parsed.data,
        signal,
      );
    },
    retry: false,
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  let message: string | null = null;
  if (!parsed.success) message = '请核对实验标的与日期区间。';
  else if (query.error) message = requestFailureMessage(query.error);
  else if (query.data?.status === 'blocked') message = query.data.message;
  const result = query.data;
  let available: Extract<BacktestModelResolutionResult, { status: 'available' }> | undefined;
  if (!message && result?.status === 'available') available = result;
  return {
    model: available?.model,
    notes: available?.notes ?? [],
    loading: query.isFetching,
    message,
    retry: () => void query.refetch(),
  };
}
