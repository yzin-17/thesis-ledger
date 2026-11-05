import { aiExecutionSummarySchema } from '@thesis-ledger/schemas';

/** 已发送的取消只能记为结果未知；未发送的预留不伪造成一次已完成请求。 */
export function cancelledResearchMetadataV2(value: unknown, now: Date) {
  const metadata =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const execution = aiExecutionSummarySchema.parse(metadata.sdkExecution);
  if (
    execution.contract.id !== 'research' ||
    execution.contract.version !== 'research-generation-v2'
  )
    throw new Error('取消入口只接受 V2 研究任务');
  const requests = execution.requests.map((request) => {
    if (request.state !== 'prepared' && request.state !== 'dispatching') return request;
    const sent = request.state === 'dispatching';
    return {
      ...request,
      state: sent ? ('unknown' as const) : ('prepared' as const),
      completedAt: sent ? now.toISOString() : request.completedAt,
      error: {
        code: 'cancelled' as const,
        phase: 'cancellation' as const,
        summary: '用户取消了研究任务',
        externalResult: sent ? ('unknown' as const) : ('not_sent' as const),
        requestId: request.requestId,
      },
    };
  });
  return {
    ...metadata,
    sdkExecution: aiExecutionSummarySchema.parse({
      ...execution,
      generationStatus: 'incomplete',
      continuationBlockedReason: 'cancelled',
      requests,
    }),
  };
}
