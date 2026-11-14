import type {
  AutomationHistoryRecord,
  AutomationRecord,
  RuleMonitorHistory,
  RuleMonitorStatus,
} from '@thesis-ledger/schemas';

export const ruleMonitorAutomationId = 'rule-source-monitor';
const jobName = '收费资料更新检查';
const errors: Record<string, string> = {
  lease_expired: '执行超时，任务已中断',
  monitor_stopped: '监测服务停止，任务已中断',
  monitor_execution_failed: '监测执行失败',
  run_budget_exceeded: '本轮检查超过时间上限',
  document_url_invalid: '资料地址不符合允许范围',
  document_http_error: '资料网站返回错误',
  document_too_large: '资料超过大小上限',
  document_invalid: '资料格式无效',
  document_unavailable: '资料暂时无法读取',
};

export function ruleMonitorAutomationJob(status: RuleMonitorStatus | null): AutomationRecord | null {
  if (status && !status.config.taskCreated) return null;
  return {
    id: ruleMonitorAutomationId,
    name: jobName,
    type: ruleMonitorAutomationId,
    cron: status?.config.cron ?? '@every24h',
    timezone: status?.config.timezone ?? 'Asia/Shanghai',
    managed: true,
    source: 'rule-monitor',
    enabled: status?.config.enabled ?? null,
    nextRunAt: status?.config.nextRunAt ?? null,
    ...(status ? {} : { readError: 'rule_monitor_unavailable' }),
  };
}

function failureSummary(run: RuleMonitorHistory['items'][number]) {
  const reasons = run.failures.map(
    (failure) => `${failure.name}：${errors[failure.errorCode] ?? failure.errorCode}`,
  );
  if (run.errorCode) reasons.unshift(errors[run.errorCode] ?? run.errorCode);
  if (run.counts.unavailable && !run.failureDetailsAvailable)
    reasons.push(`${run.counts.unavailable}份资料暂不可读；该历史记录未保留逐项失败原因`);
  return reasons.length ? reasons.join('\n') : null;
}

export function ruleMonitorAutomationRun(
  run: RuleMonitorHistory['items'][number],
): AutomationHistoryRecord {
  const trigger = { manual: '手动检查', scheduled: '自动检查', unknown: '触发方式未记录' }[
    run.trigger
  ];
  const summary = `${trigger}；已检查${run.counts.documents}份资料，${run.counts.changed}条变化，${run.counts.unavailable}份暂不可读`;
  return {
    id: `${ruleMonitorAutomationId}:${run.id}`,
    jobId: ruleMonitorAutomationId,
    jobName,
    source: 'rule-monitor',
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    error: failureSummary(run),
    summary,
    output: {
      counts: run.counts,
      trigger: run.trigger,
      sourceIds: run.sourceIds,
      failures: run.failures,
      failureDetailsAvailable: run.failureDetailsAvailable,
    },
  };
}
