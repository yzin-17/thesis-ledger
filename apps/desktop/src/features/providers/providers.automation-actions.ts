import type { ProviderActionDependencies } from './providers.actions.js';
import type { AutomationJob } from './providers.types.js';

export const createProviderAutomationHandlers = ({
  setTogglingJobId,
  toggleJobMutation,
  toastManager,
}: ProviderActionDependencies) => {
  const toggleJob = async (job: AutomationJob) => {
    setTogglingJobId(job.id);
    try {
      await toggleJobMutation.mutateAsync({ jobId: job.id, enabled: !job.enabled });
      toastManager.add({
        title: `${job.name} 已${job.enabled ? '停用' : '启用'}`,
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: `${job.name} ${job.enabled ? '停用' : '启用'}失败`,
        description: '请检查服务连接后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setTogglingJobId((current) => (current === job.id ? null : current));
    }
  };

  return { toggleJob };
};
