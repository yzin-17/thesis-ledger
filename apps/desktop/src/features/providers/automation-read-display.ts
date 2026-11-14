import type { AutomationJob, AutomationHistoryRecord } from './providers.types.js';

export function automationNextRunLabel(job: AutomationJob) {
  if (job.readError) return '暂不可读取';
  if (job.nextRunAt) return new Date(job.nextRunAt).toLocaleString('zh-CN');
  if (job.source === 'rule-monitor' && job.enabled) return '等待调度';
  return '未安排';
}

export function automationEnabledLabel(job: AutomationJob) {
  if (job.enabled === null) return '读取失败';
  return job.enabled ? '启用' : '停用';
}

export function automationRunTimeLabel(
  item: Pick<AutomationHistoryRecord, 'startedAt' | 'createdAt'>,
) {
  if (item.startedAt) return new Date(item.startedAt).toLocaleString('zh-CN');
  if (item.createdAt)
    return `尚未开始；排队时间 ${new Date(item.createdAt).toLocaleString('zh-CN')}`;
  return '尚未开始';
}
