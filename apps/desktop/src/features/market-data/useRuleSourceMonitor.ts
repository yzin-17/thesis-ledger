import { createClientRequestId } from '../../lib/client-request-id';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ruleSourceMonitorVersion,
  type RuleMonitorCheck,
  type RuleMonitorConfigure,
  type RuleMonitorStatus,
} from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
export const ruleMonitorKey = ['desktop', 'market-data', 'rule-monitor'] as const;
const api = () => getDesktopApiClient().market;
type Draft = { enabled: boolean; sourceIds: string[]; revision: number };

export function useRuleSourceMonitor() {
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
  const run = () => {
    if (!selection?.sourceIds.length) return;
    if (
      !request.current ||
      JSON.stringify(request.current.sourceIds) !== JSON.stringify(selection.sourceIds)
    )
      request.current = {
        version: ruleSourceMonitorVersion,
        requestId: createClientRequestId(),
        sourceIds: [...selection.sourceIds],
      };
    check.mutate(request.current);
  };
  const saveConfig = () => {
    if (selection)
      save.mutate({
        version: ruleSourceMonitorVersion,
        expectedRevision: selection.revision,
        enabled: selection.enabled,
        sourceIds: selection.sourceIds,
      });
  };
  const busy =
    save.isPending ||
    check.isPending ||
    ['queued', 'running'].includes(status.data?.latestRun?.status ?? '');
  return {
    status,
    selection,
    dirty: draft !== null,
    update,
    save,
    check,
    run,
    saveConfig,
    busy,
    reload: () => {
      setDraft(null);
      save.reset();
      void status.refetch();
    },
  };
}
