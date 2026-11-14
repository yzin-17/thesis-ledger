import { useQuery } from '@tanstack/react-query';
import { backtestClients } from '@thesis-ledger/api-client';
import {
  backtestModelResolutionRequestSchema,
  executionModelAccountingIssuesV3,
  type BacktestExecutionModelV3,
  type BacktestModelResolutionResult,
} from '@thesis-ledger/schemas';
import { parsedDesktopRequest } from '../shared/request.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';

type BacktestExecutionInput = {
  strategyVersionId: string;
  period: { start: string; end: string };
  currency: 'CNY' | 'HKD' | 'USD';
  adjustment: 'none' | 'qfq' | 'hfq';
  initialModel?: BacktestExecutionModelV3 | undefined;
};

export function useBacktestExecutionModel(input: BacktestExecutionInput) {
  const request = backtestModelResolutionRequestSchema.safeParse({
    strategyVersionId: input.strategyVersionId,
    startDate: input.period.start,
    endDate: input.period.end,
    currency: input.currency,
    adjustment: input.adjustment,
    policy: 'research-defaults',
  });
  const retained = retainedExecutionModel(input);
  const query = useQuery<BacktestModelResolutionResult>({
    queryKey: [
      'desktop',
      'backtest-execution-model',
      input.strategyVersionId,
      input.period.start,
      input.period.end,
      input.currency,
      input.adjustment,
      'research-defaults',
    ],
    enabled: request.success && !retained,
    queryFn: ({ signal }) => {
      if (!request.success) throw new Error('请选择有效的策略版本与回测日期。');
      return backtestClients(parsedDesktopRequest()).resolveExecutionModel(request.data, signal);
    },
    retry: false,
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });
  let message: string | null = null;
  if (!request.success) message = '请选择有效的策略版本与回测日期。';
  else if (!retained && query.error) message = requestFailureMessage(query.error);
  else if (!retained && query.data?.status === 'blocked') message = query.data.message;
  const result = query.data;
  let available: Extract<BacktestModelResolutionResult, { status: 'available' }> | undefined;
  if (!retained && result?.status === 'available') available = result;
  return {
    model: retained ?? (query.data?.status === 'available' ? query.data.model : undefined),
    retained: Boolean(retained),
    policy: available?.policy,
    notes: available?.notes ?? [],
    loading: !retained && query.isFetching,
    message,
    retry: () => void query.refetch(),
  };
}

function retainedExecutionModel(input: BacktestExecutionInput) {
  const initial = input.initialModel;
  const retained =
    initial &&
    initial.scope.currency === input.currency &&
    initial.scope.range.start <= input.period.start &&
    initial.scope.range.end >= input.period.end &&
    executionModelAccountingIssuesV3(
      initial,
      { startDate: input.period.start, endDate: input.period.end },
      input.adjustment === 'none' ? 'raw-events' : 'normalized-series',
    ).length === 0
      ? initial
      : undefined;
  return retained;
}
