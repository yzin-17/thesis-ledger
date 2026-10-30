import {
  AI_TIMEOUT_POLICY_VERSION,
  type AiExecutionSummary,
  type AiUsageFacts,
  type AiGenerationError,
  type AiGenerationContractRef,
  type AiGenerationOutcome,
} from '@thesis-ledger/schemas';
import type { AiSdkGenerationResult } from '../ai-sdk-generation.adapter.js';
import { AiSdkGenerationError } from '../ai-sdk-generation-facts.js';
import { researchExecutionDeadline, researchTimeoutPolicy } from './ai-execution-clock.js';
import { AiExecutionTimeoutError } from './ai-timeout-scope.js';

export function researchFailureOutcome(
  error: AiGenerationError,
  received: Pick<
    AiSdkGenerationResult<unknown>,
    'rawFinishReason' | 'finishReason' | 'actualModel'
  > | null,
  contract: AiGenerationContractRef,
  model: string,
): AiGenerationOutcome {
  if (
    received !== null &&
    error.externalResult === 'complete' &&
    ['task_budget_exhausted', 'cancelled'].includes(error.code)
  )
    return {
      status: 'complete',
      finishReason: received.rawFinishReason ?? received.finishReason,
      contract,
      schemaAccepted: true,
      actualModel: received.actualModel ?? model,
    };
  return { status: 'incomplete', finishReason: error.code, contract, schemaAccepted: false };
}

/** 收到完整生成仍需检查任务准入；已知usage不因迟到而变成零或unknown。 */
export function assertResearchResultArrival(input: {
  execution: AiExecutionSummary;
  requestId: string;
  receivedAt: Date;
  signal: AbortSignal;
  usage: AiUsageFacts;
  ownership?: { runId: string; executionAttempt: number };
}) {
  const late = input.receivedAt.getTime() >= researchExecutionDeadline(input.execution);
  const cancelled =
    input.signal.aborted && !(input.signal.reason instanceof AiExecutionTimeoutError);
  if (!late && !cancelled) return;
  if (cancelled) {
    const lost = ['lease_lost', 'lease_renewal_failed', 'worker_shutdown'].includes(
      String(input.signal.reason),
    );
    throw new AiSdkGenerationError(
      {
        code: lost ? 'execution_lease_lost' : 'cancelled',
        phase: 'cancellation',
        summary: lost ? '执行所有权已失效，未发布晚到结果' : '用户已取消，未发布晚到结果',
        externalResult: 'complete',
        requestId: input.requestId,
      },
      input.usage,
    );
  }
  const policy = researchTimeoutPolicy(input.execution),
    first = input.execution.timing?.firstStartedAt ?? null;
  const error =
    input.signal.reason instanceof AiExecutionTimeoutError
      ? input.signal.reason
      : new AiExecutionTimeoutError({
          version: AI_TIMEOUT_POLICY_VERSION,
          profile: policy.profile,
          stage: 'task_budget',
          authority: 'task',
          startedAt: first,
          elapsedMs:
            first === null ? null : Math.max(0, input.receivedAt.getTime() - Date.parse(first)),
          limitMs: policy.taskBudgetMs - policy.cleanupReserveMs,
          deadlineAt: new Date(researchExecutionDeadline(input.execution)).toISOString(),
          taskDeadlineAt: input.execution.deadlineAt,
          remainingMs: 0,
          lastProgressAt: null,
          runId: input.ownership?.runId ?? null,
          executionAttempt: input.ownership?.executionAttempt ?? null,
        });
  throw new AiSdkGenerationError(
    {
      code: 'task_budget_exhausted',
      phase: 'validation',
      summary: error.message,
      externalResult: 'complete',
      requestId: input.requestId,
      timeout: error.diagnostic,
    },
    input.usage,
    { cause: error },
  );
}
