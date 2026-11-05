import type { Prisma } from '@prisma/client';
import type { AiExecutionSummary } from '@thesis-ledger/schemas';
import { researchExecutionDeadline } from './timeout/ai-execution-clock.js';

type PublicationInput = {
  result?: unknown;
  finalization?: { provider: string; model: string; durationMs?: number; receivedAt?: Date };
};

/** 行锁内决定业务发布；保留已完成的生成／用量事实，期限失败只阻止成功结果。 */
export function aiExecutionPublication(
  execution: AiExecutionSummary,
  input: PublicationInput,
  completedAt: Date,
  now = new Date(),
) {
  const data: Prisma.AiRunUpdateInput = {};
  let blocked: AiExecutionSummary['continuationBlockedReason'] = null;
  if (input.result !== undefined) {
    const research = execution.contract.id === 'research';
    const missingDeadline = research && execution.deadlineAt === null;
    const receivedAt = input.finalization?.receivedAt ?? completedAt;
    const expired =
      research &&
      !missingDeadline &&
      (receivedAt.getTime() >= researchExecutionDeadline(execution) ||
        now.getTime() >= Date.parse(execution.deadlineAt!));
    data.completedAt = now;
    data.claimedAt = null;
    data.leaseUntil = null;
    if (missingDeadline || expired) {
      data.status = 'failed';
      data.errorCode = missingDeadline
        ? 'research_policy_missing'
        : 'research_task_budget_exhausted';
      data.errorSummary = missingDeadline
        ? '研究缺少冻结期限，拒绝发布结果'
        : '研究结果在执行截止后到达或发布超出任务总预算，未发布成功结果';
      blocked = missingDeadline ? 'capability_revoked' : 'expired';
    } else {
      data.status = 'succeeded';
      data.result = input.result as Prisma.InputJsonValue;
    }
  }
  if (input.finalization) {
    data.provider = input.finalization.provider;
    data.model = input.finalization.model;
    if (input.finalization.durationMs !== undefined)
      data.durationMs = input.finalization.durationMs;
  }
  return { data, blocked };
}
