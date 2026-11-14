import { ruleSourceMonitorClient } from '@thesis-ledger/api-client';
import { ruleSourceMonitorVersion } from '@thesis-ledger/schemas';
import { parsedDesktopRequest, type DesktopRequestClient } from '../shared/request.js';
import type { AutomationJob, UpdateAutomationJobInput } from './providers.types.js';

export async function updateRuleMonitorExecutionTime(
  input: UpdateAutomationJobInput,
  client?: DesktopRequestClient,
): Promise<AutomationJob> {
  if (input.name !== undefined || input.enabled !== undefined)
    throw new Error('该编辑只调整执行时间');
  const api = ruleSourceMonitorClient(parsedDesktopRequest(client));
  const current = await api.getRuleMonitor();
  if (!current.config.taskCreated) throw new Error('请先在规则检测页创建任务');
  const { config } = await api.updateRuleMonitorSchedule({
    version: ruleSourceMonitorVersion,
    expectedRevision: current.config.revision,
    cron: input.cron ?? current.config.cron,
    timezone: input.timezone ?? current.config.timezone,
  });
  return {
    id: 'rule-source-monitor',
    name: '收费资料更新检查',
    type: 'rule-source-monitor',
    managed: true,
    source: 'rule-monitor',
    cron: config.cron,
    timezone: config.timezone,
    enabled: config.enabled,
    nextRunAt: config.nextRunAt,
  };
}
