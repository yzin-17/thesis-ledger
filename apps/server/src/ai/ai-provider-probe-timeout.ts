import type { AiExecutionTimeoutPolicy } from '@thesis-ledger/schemas';
import type { AiProviderInput, AiProviderExecutionRouteInput } from './ai-provider.contracts.js';
import { aiTimeoutProfileFor, createAiTimeoutPolicy } from './timeout/ai-timeout-policy.js';

const selected = (route: number | undefined, provider: number | undefined) => {
  if (route !== undefined) return { value: route, source: 'route' as const };
  if (provider !== undefined) return { value: provider, source: 'provider' as const };
  return { value: undefined, source: 'system' as const };
};
export function probeTimeoutOverrides(
  provider: Pick<AiProviderInput, 'firstOutputTimeoutMs' | 'outputIdleTimeoutMs'>,
  route?: Pick<AiProviderExecutionRouteInput, 'firstOutputTimeoutMs' | 'outputIdleTimeoutMs'>,
) {
  const first = selected(route?.firstOutputTimeoutMs, provider.firstOutputTimeoutMs);
  const idle = selected(route?.outputIdleTimeoutMs, provider.outputIdleTimeoutMs);
  return {
    ...(first.value === undefined ? {} : { firstOutputTimeoutMs: first.value }),
    ...(idle.value === undefined ? {} : { outputIdleTimeoutMs: idle.value }),
    firstOutputTimeoutSource: first.source,
    outputIdleTimeoutSource: idle.source,
  };
}
export function validationProbeTimeouts(
  input: AiProviderInput,
  route: AiProviderExecutionRouteInput,
  root: { deadline: number; policy?: AiExecutionTimeoutPolicy; taskDeadlineAt?: number },
) {
  const policy = createAiTimeoutPolicy(aiTimeoutProfileFor(route));
  return {
    ...probeTimeoutOverrides(input, route),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    policy: { ...policy, taskBudgetMs: root.policy?.taskBudgetMs ?? policy.taskBudgetMs },
    taskDeadlineAt: root.taskDeadlineAt ?? root.deadline + policy.cleanupReserveMs,
  };
}
