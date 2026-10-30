import { createAiTimeoutPolicy, resolveAiExecutionTimeout } from './ai-timeout-policy.js';
import { createAiTimeoutScope } from './ai-timeout-scope.js';

/** 离线实验保留其显式授权预算；调用规则复用正式执行解析器。 */
export const createExperimentTimeout = (input: {
  budgetMs: number;
  startedAt: number;
  now: () => number;
  signal?: AbortSignal | undefined;
  cleanupReserveMs?: 0 | undefined;
}) => {
  const policy = {
    ...createAiTimeoutPolicy('research', input.budgetMs),
    ...(input.cleanupReserveMs === undefined ? {} : { cleanupReserveMs: input.cleanupReserveMs }),
  };
  const taskDeadlineAt = input.startedAt + input.budgetMs;
  const scope = createAiTimeoutScope({ policy, taskDeadlineAt, signal: input.signal });
  return {
    ...scope,
    remaining: () => taskDeadlineAt - input.now() - policy.cleanupReserveMs,
    request: () => {
      const timeoutDecision = resolveAiExecutionTimeout({
        policy,
        taskDeadlineAt,
        now: input.now(),
        transport: 'single',
      });
      if (!timeoutDecision.canStart)
        scope.cancel(new DOMException('任务总预算已耗尽', 'TimeoutError'));
      scope.assertActive();
      return { timeoutDecision, timeout: timeoutDecision.sdkTimeout };
    },
  };
};
