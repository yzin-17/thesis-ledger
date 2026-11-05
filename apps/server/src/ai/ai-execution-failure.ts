import {
  aiExecutionSummarySchema,
  aiGenerationErrorSchema,
  type AiExecutionSummary,
  type AiGenerationError,
} from '@thesis-ledger/schemas';

/** 终态失败保留已知事实；获得授权但明确未发送不伪装成Provider执行完成。 */
export function failedAiExecution(
  execution: AiExecutionSummary,
  input: {
    continuationBlockedReason?: AiExecutionSummary['continuationBlockedReason'];
    requestError?: AiGenerationError;
  },
  now: Date,
) {
  const error = input.requestError ? aiGenerationErrorSchema.parse(input.requestError) : null;
  const requests = execution.requests.map((request) => {
    if (
      !error ||
      request.requestId !== error.requestId ||
      !['prepared', 'dispatching'].includes(request.state)
    )
      return request;
    if (request.state === 'prepared') return { ...request, error };
    if (error.externalResult !== 'not_sent') return request;
    return {
      ...request,
      error,
      state: 'completed' as const,
      completedAt: now.toISOString(),
      outcome: {
        status: 'incomplete' as const,
        finishReason: error.code,
        contract: execution.contract,
        schemaAccepted: false,
      },
    };
  });
  return aiExecutionSummarySchema.parse({
    ...execution,
    requests,
    generationStatus:
      execution.generationStatus === 'pending' ? 'incomplete' : execution.generationStatus,
    continuationBlockedReason:
      input.continuationBlockedReason ?? execution.continuationBlockedReason,
  });
}
