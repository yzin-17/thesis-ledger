import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ruleSourceMonitorVersion } from '@thesis-ledger/schemas';
import { useToastManager } from '@/components/ui/toast';
import { useRuleSourceMonitor } from '../market-data/useRuleSourceMonitor.js';
import { providerKeys } from './providers.queries.js';
import { apiErrorMessage } from './providers.automation-actions.js';
import type { AutomationJob } from './providers.types.js';

export const ruleMonitorJobId = 'rule-source-monitor';
type Action = 'toggle' | 'run';

/** 自动化管理入口复用监测配置与幂等执行，仍由原调度器执行。 */
export function useRuleMonitorAutomation() {
  const monitor = useRuleSourceMonitor();
  const client = useQueryClient();
  const toast = useToastManager();
  const [pending, setPending] = useState<Action | null>(null);
  const locked = useRef(false);
  useEffect(() => {
    if (!monitor.status.data) return;
    void client.invalidateQueries({ queryKey: providerKeys.jobs() });
    void client.invalidateQueries({ queryKey: providerKeys.jobHistory() });
  }, [client, monitor.status.data]);

  const act = async (action: Action) => {
    if (locked.current) return;
    toast.close?.(`rule-monitor-automation-${action}`);
    locked.current = true;
    setPending(action);
    try {
      const result = await monitor.status.refetch();
      if (result.error || !result.data) throw result.error ?? new Error('监测配置未读取');
      const { config, latestRun } = result.data;
      if (!config.sourceIds.length && (action === 'run' || !config.enabled)) {
        toast.add({ title: '请在规则检测页选择来源并创建任务', type: 'info' });
        return;
      }
      if (action === 'toggle') {
        await monitor.save.mutateAsync({
          version: ruleSourceMonitorVersion,
          expectedRevision: config.revision,
          enabled: !config.enabled,
          sourceIds: config.sourceIds,
        });
        toast.add({
          title: `收费资料更新检查 已${config.enabled ? '停用' : '启用'}`,
          type: 'success',
        });
      } else if (latestRun && ['queued', 'running'].includes(latestRun.status)) {
        toast.add({ title: '收费资料更新检查已有实例运行', type: 'info' });
      } else {
        await monitor.runSources(config.sourceIds);
        toast.add({ title: '收费资料更新检查已提交', type: 'success' });
      }
    } catch (error) {
      const fallback =
        action === 'run'
          ? '检查结果暂未确认，重试会核对这次检查。'
          : '配置保存失败，请重新读取后重试；编辑中的修改已保留。';
      toast.add({
        id: `rule-monitor-automation-${action}`,
        title: action === 'run' ? '检查结果暂未确认' : '保存任务失败',
        description: apiErrorMessage(error, fallback),
        type: 'error',
        timeout: 0,
      });
    } finally {
      locked.current = false;
      setPending(null);
    }
  };
  const running =
    pending === 'run' ||
    ['queued', 'running'].includes(monitor.status.data?.latestRun?.status ?? '');
  const handleAction = (
    job: AutomationJob,
    action: Action,
    fallback: (job: AutomationJob) => unknown,
  ) => {
    if (job.source !== 'rule-monitor') {
      void fallback(job);
      return;
    }
    void act(action);
  };
  return { monitor, pending, running, act, handleAction };
}
