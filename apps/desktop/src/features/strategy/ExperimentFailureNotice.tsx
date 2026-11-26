import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { canRetryOptimizationExperiment } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { createClientRequestId } from '../../lib/client-request-id';
import { experimentStopReasonText } from './strategy-experiment-detail.model';
import { useExperimentOperationFeedback } from './useExperimentOperationFeedback';
import {
  retryOptimizationExperiment,
  type OptimizationExperimentSummary,
} from './strategy-optimization.api';

export function ExperimentFailureNotice({
  experiment,
  disabled = false,
  onRetried,
}: {
  experiment: OptimizationExperimentSummary;
  disabled?: boolean;
  onRetried: () => Promise<void>;
}) {
  const { notifySuccess, clearOperationError, reportOperationError } =
    useExperimentOperationFeedback();
  const intent = useRef({
    attempt: experiment.executionAttempt ?? 0,
    key: createClientRequestId(),
  });
  const retry = useMutation({
    onMutate: () => clearOperationError('retry'),
    mutationFn: () => {
      const attempt = experiment.executionAttempt ?? 0;
      if (intent.current.attempt !== attempt)
        intent.current = { attempt, key: createClientRequestId() };
      return retryOptimizationExperiment(experiment.id, {
        expectedExecutionAttempt: attempt,
        idempotencyKey: intent.current.key,
      });
    },
    onSuccess: async () => {
      notifySuccess({ title: '已受理原实验重试' });
      await onRetried();
    },
    onError: (error) => reportOperationError('retry', '实验重试失败', error),
  });
  if (!experiment.stopReason && experiment.status !== 'failed') return null;
  const canRetry = canRetryOptimizationExperiment(experiment);
  return (
    <Alert variant="destructive">
      <AlertTitle>实验已停止</AlertTitle>
      <AlertDescription>
        <p>
          {experiment.stopReason ? experimentStopReasonText(experiment.stopReason) : '实验执行失败'}
        </p>
        {canRetry ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              className="text-foreground shadow-none"
              disabled={disabled || retry.isPending}
              onClick={() => retry.mutate()}
            >
              {retry.isPending ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : (
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
              )}
              {retry.isPending ? '正在重试' : '失败重试'}
            </Button>
            <span className="text-muted-foreground">
              保留历史和累计用量，按原配置重新请求模型。
            </span>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
