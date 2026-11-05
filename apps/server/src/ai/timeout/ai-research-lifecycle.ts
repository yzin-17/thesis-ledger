import type { AiExecutionSummary, AiGenerationError } from '@thesis-ledger/schemas';
import type { AiExecutionOwnership, AiExecutionStateStore } from '../ai-execution-state.store.js';
import { AiSdkGenerationError, sanitize } from '../ai-sdk-generation-facts.js';
import { AiFrozenResearchError } from '../ai-frozen-research.js';
import { researchTimeoutPolicy } from './ai-execution-clock.js';
import { AiExecutionTimeoutError, createAiTimeoutScope } from './ai-timeout-scope.js';

export const researchStopReason = (
  fact: AiGenerationError,
): AiExecutionSummary['continuationBlockedReason'] | undefined => {
  if (fact.code === 'task_budget_exhausted') return 'expired';
  if (fact.code === 'cancelled') return 'cancelled';
  if (fact.code === 'execution_lease_lost') return 'capability_revoked';
  return undefined;
};

export const researchFailureCode = (fact: AiGenerationError) => {
  const precise =
    fact.timeout !== undefined ||
    ['upstream_timeout', 'cancelled', 'execution_lease_lost'].includes(fact.code);
  if (!precise && fact.externalResult === 'unknown') return 'research_unknown_outcome';
  return 'research_' + fact.code;
};

export function createResearchLifecycle(
  store: AiExecutionStateStore,
  ownership: AiExecutionOwnership,
  execution: AiExecutionSummary,
) {
  const scope = createAiTimeoutScope({
    policy: researchTimeoutPolicy(execution),
    taskDeadlineAt: Date.parse(execution.deadlineAt!),
    ...ownership,
  });
  let closed = false;
  const heartbeat = setInterval(() => {
    void store
      .renewLease(ownership, 60_000)
      .then((renewed) => {
        if (!closed && !renewed) scope.cancel('lease_lost');
      })
      .catch(() => {
        if (!closed) scope.cancel('lease_renewal_failed');
      });
  }, 20_000);
  heartbeat.unref?.();
  return {
    ...scope,
    close: () => {
      closed = true;
      clearInterval(heartbeat);
      scope.close();
    },
  };
}

export function researchLifecycleFailure(
  error: unknown,
  signal: AbortSignal,
  hasProviders: boolean,
) {
  let errorCode = hasProviders ? 'research_execution_failed' : 'provider_unavailable';
  let blocked: AiExecutionSummary['continuationBlockedReason'] | undefined;
  if (error instanceof AiSdkGenerationError) {
    errorCode = researchFailureCode(error.fact);
    blocked = researchStopReason(error.fact);
  } else if (error instanceof AiExecutionTimeoutError) {
    errorCode = 'research_task_budget_exhausted';
    blocked = 'expired';
  } else if (error instanceof AiFrozenResearchError) errorCode = error.errorCode;
  else if (error instanceof DOMException && error.name === 'AbortError') {
    if (signal.reason instanceof AiExecutionTimeoutError) {
      errorCode = 'research_task_budget_exhausted';
      blocked = 'expired';
    } else if (
      ['lease_lost', 'lease_renewal_failed', 'worker_shutdown'].includes(String(signal.reason))
    ) {
      errorCode = 'research_execution_lease_lost';
      blocked = 'capability_revoked';
    } else {
      errorCode = 'research_cancelled';
      blocked = 'cancelled';
    }
  }
  return {
    errorCode,
    errorSummary: sanitize(error),
    ...(blocked ? { continuationBlockedReason: blocked } : {}),
  };
}
