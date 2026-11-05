import { aiExecutionSummarySchema, aiTimeoutDecisionSchema } from '@thesis-ledger/schemas';
import type { PrismaService } from '../../platform/prisma.service.js';
import type { AiExecutionOwnership } from '../ai-execution-state.store.js';
import { researchExecutionDeadline } from './ai-execution-clock.js';

/** 派发前持久化安全决策；所有权、截止和请求状态同锁检查。 */
export const recordAiTimeoutDecision = (
  prisma: PrismaService,
  ownership: AiExecutionOwnership,
  requestId: string,
  value: unknown,
) => {
  const decision = aiTimeoutDecisionSchema.parse(value);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        status: string;
        executionAttempt: number;
        leaseUntil: Date | null;
        modelMetadata: unknown;
      }>
    >`
      SELECT "status", "executionAttempt", "leaseUntil", "modelMetadata" FROM "AiRun" WHERE "id" = ${ownership.runId}::uuid FOR UPDATE`;
    const run = rows[0],
      now = Date.now();
    if (
      !run ||
      run.status !== 'running' ||
      run.executionAttempt !== ownership.executionAttempt ||
      !run.leaseUntil ||
      run.leaseUntil.getTime() <= now
    )
      return false;
    const metadata = run.modelMetadata as Record<string, unknown>;
    const execution = aiExecutionSummarySchema.parse(metadata.sdkExecution);
    if (researchExecutionDeadline(execution) <= now) return false;
    const request = execution.requests.find((item) => item.requestId === requestId);
    if (!request || request.state !== 'dispatching') return false;
    if (request.timeoutDecision) throw new Error('同一派发不得重新解释超时策略');
    request.timeoutDecision = decision;
    await tx.aiRun.update({
      where: { id: ownership.runId },
      data: { modelMetadata: { ...metadata, sdkExecution: execution } },
    });
    return true;
  });
};
