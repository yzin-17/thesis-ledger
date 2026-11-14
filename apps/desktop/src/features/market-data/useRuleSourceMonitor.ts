import { createClientRequestId } from '../../lib/client-request-id';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ruleSourceMonitorVersion,
  type RuleMonitorCheck,
  type RuleMonitorConfigure,
  type RuleMonitorStatus,
  type RuleMonitorTask,
} from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
export const ruleMonitorKey = ['desktop', 'market-data', 'rule-monitor'] as const;
const api = () => getDesktopApiClient().market;
type Draft = { enabled: boolean; sourceIds: string[]; revision: number };

export function useRuleSourceMonitor(options: { onTaskSaved?: () => void } = {}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const request = useRef<RuleMonitorCheck | null>(null);
  const status = useQuery({
    queryKey: ruleMonitorKey,
    queryFn: ({ signal }) => api().getRuleMonitor(signal),
    retry: false,
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false;
      const state = query.state.data?.latestRun?.status;
      return state === 'queued' || state === 'running' ? 1000 : false;
    },
  });
  const save = useMutation({
    mutationFn: (input: RuleMonitorConfigure) => api().configureRuleMonitor(input),
    onMutate: () => client.cancelQueries({ queryKey: ruleMonitorKey }),
    onSuccess: (result) => {
      client.setQueryData<RuleMonitorStatus>(ruleMonitorKey, (current) =>
        current ? { ...current, config: result.config } : current,
      );
      setDraft(null);
      void client.invalidateQueries({ queryKey: ruleMonitorKey });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ruleMonitorKey });
    },
  });
  const create = useMutation({
    mutationFn: (input: RuleMonitorTask) => api().createRuleMonitorTask(input),
    onMutate: () => client.cancelQueries({ queryKey: ruleMonitorKey }),
    onSuccess: (result) => {
      client.setQueryData<RuleMonitorStatus>(ruleMonitorKey, (current) =>
        current ? { ...current, config: result.config } : current,
      );
      setDraft(null);
      options.onTaskSaved?.();
      void client.invalidateQueries({ queryKey: ruleMonitorKey });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ruleMonitorKey });
    },
  });
  const check = useMutation({
    mutationFn: (input: RuleMonitorCheck) => api().checkRuleSources(input),
    onMutate: () => client.cancelQueries({ queryKey: ruleMonitorKey }),
    onSuccess: (result) => {
      request.current = null;
      client.setQueryData<RuleMonitorStatus>(ruleMonitorKey, (current) =>
        current ? { ...current, latestRun: result.run } : current,
      );
      void client.invalidateQueries({ queryKey: ruleMonitorKey });
    },
  });
  const selection = draft ?? status.data?.config;
  const update = (change: Partial<Draft>) => {
    if (selection) setDraft({ ...selection, ...change });
  };
  const checkInput = (sourceIds: string[]) => {
    if (!request.current || JSON.stringify(request.current.sourceIds) !== JSON.stringify(sourceIds))
      request.current = {
        version: ruleSourceMonitorVersion,
        requestId: createClientRequestId(),
        sourceIds: [...sourceIds],
      };
    return request.current;
  };
  const runSources = (sourceIds: string[]) => check.mutateAsync(checkInput(sourceIds));
  const createTask = () => {
    if (selection)
      create.mutate({
        version: ruleSourceMonitorVersion,
        expectedRevision: selection.revision,
        sourceIds: selection.sourceIds,
      });
  };
  const reloadTask = async () => {
    const result = await status.refetch();
    if (result.error || !result.data) return;
    const revision = result.data.config.revision;
    setDraft((current) => (current ? { ...current, revision } : null));
    create.reset();
  };
  const busy =
    save.isPending ||
    create.isPending ||
    check.isPending ||
    ['queued', 'running'].includes(status.data?.latestRun?.status ?? '');
  return {
    status,
    selection,
    dirty: draft !== null,
    update,
    save,
    check,
    runSources,
    create,
    createTask,
    reloadTask,
    busy,
  };
}
