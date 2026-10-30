import type { AiExecutionReadModel } from '@thesis-ledger/schemas';

const labels = { connection_probe: '连通性探测', research: '普通研究', deep_research: '深度研究' };
export function aiTimeoutPolicyLines(timing: AiExecutionReadModel['timing']) {
  if (!timing) return [];
  const lines = [
    `${labels[timing.policy.profile]}，最长 ${timing.policy.taskBudgetMs / 1000} 秒（含 ${timing.policy.cleanupReserveMs / 1000} 秒收尾）`,
  ];
  if (timing.taskDeadlineAt === null)
    lines.push(`排队等待，排队到期 ${new Date(timing.queueExpiresAt).toLocaleString('zh-CN')}`);
  return lines;
}
