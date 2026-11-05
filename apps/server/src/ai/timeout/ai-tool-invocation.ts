import {
  aiTimeoutDurationSchema,
  type AiExecutionTimeoutPolicy,
  type AiTimeoutDiagnostic,
} from '@thesis-ledger/schemas';
import type { AiTool } from '../contracts.js';
import { createAiTimeoutPolicy } from './ai-timeout-policy.js';
import { AiExecutionTimeoutError, createAiTimeoutScope } from './ai-timeout-scope.js';

export type AiToolExecutionContext = {
  signal?: AbortSignal;
  policy?: AiExecutionTimeoutPolicy;
  taskDeadlineAt?: number;
  onObservation?: (observation: {
    durationMs: number;
    censored: boolean;
    succeeded: boolean;
  }) => void;
};

/** 下传取消，同时收敛不合作的调用；无法证明外部计算已停止。 */
export async function invokeAiTool(
  tool: AiTool,
  input: unknown,
  timeoutMs?: number,
  context: AiToolExecutionContext = {},
) {
  const policy = context.policy ?? createAiTimeoutPolicy('research');
  const stageLimitMs = aiTimeoutDurationSchema.parse(
    timeoutMs ?? tool.timeoutMs ?? policy.toolTimeoutMs,
  );
  const scope = createAiTimeoutScope({
    policy,
    taskDeadlineAt: context.taskDeadlineAt ?? Date.now() + policy.taskBudgetMs,
    signal: context.signal,
    stage: 'tool',
    stageLimitMs,
  });
  let onAbort: (() => void) | undefined;
  const started = performance.now();
  let succeeded = false,
    interrupted = false,
    invoked = false,
    settled = false;
  try {
    scope.assertActive();
    const result = await new Promise<unknown>((resolve, reject) => {
      onAbort = () => {
        if (settled) return;
        interrupted = true;
        const reason: unknown = scope.signal.reason;
        reject(reason instanceof Error ? reason : new DOMException(String(reason), 'AbortError'));
      };
      scope.signal.addEventListener('abort', onAbort, { once: true });
      Promise.resolve()
        .then(() => {
          scope.assertActive();
          invoked = true;
          return tool.execute(input, scope.signal);
        })
        .then(
          (value) => {
            settled = true;
            resolve(value);
          },
          (error: unknown) => {
            settled = true;
            reject(error instanceof Error ? error : new Error('工具执行失败', { cause: error }));
          },
        );
    });
    scope.assertActive();
    succeeded = true;
    return result;
  } finally {
    try {
      if (invoked)
        context.onObservation?.({
          durationMs: Math.max(0, performance.now() - started),
          censored: interrupted,
          succeeded,
        });
    } catch {
      /* 观测不改变工具结果。 */
    }
    if (onAbort) scope.signal.removeEventListener('abort', onAbort);
    scope.close();
  }
}

export const toolFailureFacts = (
  error: unknown,
): {
  errorCode: string;
  timeout?: AiTimeoutDiagnostic;
  cancellationRequested?: boolean;
  stopConfirmed?: boolean;
} => {
  if (error instanceof AiExecutionTimeoutError)
    return {
      errorCode: error.diagnostic.stage === 'tool' ? 'tool_timeout' : 'task_budget_exhausted',
      timeout: error.diagnostic,
      cancellationRequested: true,
      stopConfirmed: false,
    };
  if (
    ['lease_lost', 'worker_shutdown', 'capability_revoked'].includes(
      error instanceof Error ? error.message : String(error),
    )
  )
    return { errorCode: 'execution_lease_lost', cancellationRequested: true, stopConfirmed: false };
  if ((error instanceof DOMException && error.name === 'AbortError') || error === 'cancelled')
    return { errorCode: 'cancelled', cancellationRequested: true, stopConfirmed: false };
  return { errorCode: 'tool_unavailable' };
};
