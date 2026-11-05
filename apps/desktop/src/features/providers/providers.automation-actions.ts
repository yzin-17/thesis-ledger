import type { FormEvent } from 'react';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';

import type { ProviderActionDependencies, ProviderToastManager } from './providers.actions.js';
import type {
  AutomationJob,
  AutomationJobDraft,
  CreateAutomationJobInput,
} from './providers.types.js';
import {
  automationJobDraftFromJob,
  automationOutputSummary,
  newAutomationJobDraft,
} from './providers.types.js';

export const apiErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ThesisLedgerApiError && error.payload?.message) {
    return error.payload.message;
  }
  return fallback;
};

const automationEditorErrorToastId = (editing: AutomationJob | null) =>
  editing
    ? `provider-automation-editor-save-error:${editing.id}`
    : 'provider-automation-editor-create-error';

const automationToggleErrorToastId = (jobId: string) => `provider-automation-toggle-error:${jobId}`;
const automationRunErrorToastId = (jobId: string) => `provider-automation-run-error:${jobId}`;
const automationDeleteErrorToastId = (jobId: string) => `provider-automation-delete-error:${jobId}`;

const addAutomationErrorToast = (
  toastManager: ProviderToastManager,
  title: string,
  error: unknown,
  id?: string,
) =>
  toastManager.add({
    ...(id ? { id } : {}),
    title,
    description: apiErrorMessage(error, '请检查服务连接后重试。'),
    type: 'error',
    timeout: 0,
    priority: 'high',
  });

export const buildCreateAutomationJobPayload = (
  draft: AutomationJobDraft,
): CreateAutomationJobInput => ({
  id: crypto.randomUUID(),
  name: draft.name,
  type: draft.type,
  cron: draft.cron,
  timezone: 'Asia/Shanghai',
  enabled: draft.enabled,
  retry: { maxAttempts: 3, backoffMs: 1000 },
  lockTtlMs: 300_000,
});

export const buildUpdateAutomationJobPatch = (draft: AutomationJobDraft, job: AutomationJob) => ({
  ...(draft.name !== job.name ? { name: draft.name } : {}),
  ...(draft.cron !== job.cron ? { cron: draft.cron } : {}),
  ...(draft.enabled !== job.enabled ? { enabled: draft.enabled } : {}),
});

export const createProviderAutomationHandlers = ({
  setTogglingJobId,
  toggleJobMutation,
  toastManager,
  automationDraft,
  editingAutomationJob,
  savingAutomationDraft,
  runningJobId,
  setAutomationSheetOpen,
  setAutomationDraft,
  setEditingAutomationJob,
  setSavingAutomationDraft,
  setRunningJobId,
  createJobMutation,
  updateJobMutation,
  deleteJobMutation,
  runJobMutation,
  deletingJobIdRef,
  setDeletingJobId,
  confirm,
}: ProviderActionDependencies) => {
  let localDeletingJobId: string | null = null;
  const currentDeletingJobId = () =>
    deletingJobIdRef ? deletingJobIdRef.current : localDeletingJobId;
  const setCurrentDeletingJobId = (jobId: string | null) => {
    if (deletingJobIdRef) deletingJobIdRef.current = jobId;
    else localDeletingJobId = jobId;
  };

  const toggleJob = async (job: AutomationJob) => {
    const errorToastId = automationToggleErrorToastId(job.id);
    toastManager.close?.(errorToastId);
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
        id: errorToastId,
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

  const openAutomationEditor = (job?: AutomationJob) => {
    setEditingAutomationJob(job ?? null);
    setAutomationDraft(job ? automationJobDraftFromJob(job) : newAutomationJobDraft());
    setAutomationSheetOpen(true);
  };

  const closeAutomationEditor = () => setAutomationSheetOpen(false);

  const updateAutomationDraft = (updater: (current: AutomationJobDraft) => AutomationJobDraft) => {
    setAutomationDraft(updater);
  };

  const submitAutomationEditor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingAutomationDraft) return;
    const editing = editingAutomationJob;
    const errorToastId = automationEditorErrorToastId(editing);
    toastManager.close?.(errorToastId);
    setSavingAutomationDraft(true);
    try {
      if (editing) {
        const patch = buildUpdateAutomationJobPatch(automationDraft, editing);
        if (Object.keys(patch).length > 0) {
          await updateJobMutation.mutateAsync({ jobId: editing.id, patch });
        }
        toastManager.add({
          title: `任务「${automationDraft.name}」已保存`,
          type: 'success',
          timeout: 2800,
        });
      } else {
        const created = await createJobMutation.mutateAsync(
          buildCreateAutomationJobPayload(automationDraft),
        );
        toastManager.add({
          title: `任务「${created.name}」已创建`,
          type: 'success',
          timeout: 2800,
        });
      }
      setAutomationSheetOpen(false);
    } catch (error) {
      addAutomationErrorToast(
        toastManager,
        editing ? '保存任务失败' : '创建任务失败',
        error,
        errorToastId,
      );
    } finally {
      setSavingAutomationDraft(false);
    }
  };

  const runJobNow = async (job: AutomationJob) => {
    if (runningJobId !== null) return;
    const errorToastId = automationRunErrorToastId(job.id);
    toastManager.close?.(errorToastId);
    setRunningJobId(job.id);
    try {
      const result = await runJobMutation.mutateAsync(job.id);
      if (result.skipped) {
        toastManager.add({
          title: `${job.name} 未执行`,
          description: result.reason ?? '任务已有实例运行',
          type: 'info',
          timeout: 4000,
        });
      } else {
        toastManager.add({
          title: `${job.name} 已执行完成`,
          description: automationOutputSummary(result.output),
          type: 'success',
          timeout: 2800,
        });
      }
    } catch (error) {
      addAutomationErrorToast(toastManager, `${job.name} 执行失败`, error, errorToastId);
    } finally {
      setRunningJobId((current) => (current === job.id ? null : current));
    }
  };

  const deleteJob = async (job: AutomationJob) => {
    if (currentDeletingJobId() !== null) return;
    setCurrentDeletingJobId(job.id);
    let confirmed: boolean;
    try {
      confirmed = await confirm({
        title: `删除任务「${job.name}」？`,
        description: '有运行历史的任务无法删除，可改用停用；删除后不再按计划执行。',
        confirmLabel: '删除任务',
        cancelLabel: '取消',
        variant: 'destructive',
      });
    } catch (error) {
      setCurrentDeletingJobId(null);
      throw error;
    }
    if (!confirmed) {
      setCurrentDeletingJobId(null);
      return;
    }

    const errorToastId = automationDeleteErrorToastId(job.id);
    toastManager.close?.(errorToastId);
    setDeletingJobId?.(job.id);
    try {
      await deleteJobMutation.mutateAsync(job.id);
      toastManager.add({
        title: `${job.name} 已删除`,
        type: 'success',
        timeout: 2800,
      });
    } catch (error) {
      addAutomationErrorToast(toastManager, `${job.name} 删除失败`, error, errorToastId);
    } finally {
      if (currentDeletingJobId() === job.id) {
        setCurrentDeletingJobId(null);
        setDeletingJobId?.((current) => (current === job.id ? null : current));
      }
    }
  };

  return {
    toggleJob,
    openAutomationEditor,
    closeAutomationEditor,
    updateAutomationDraft,
    submitAutomationEditor,
    runJobNow,
    deleteJob,
  };
};
