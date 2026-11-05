import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import {
  normalizeResearchSubmissionV2,
  type ResearchSubmissionV2,
  type ResearchSubmissionReceiptV2,
} from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { researchKeys, useResearchIdentity } from './research.queries.js';
import { readPendingResearch, savePendingResearch } from './research-submission-pending.js';
import { currentIdentitySession } from '../../shared/api/identity-session.js';
import { aiKeys } from './ai.queries.js';

type Receipt = ResearchSubmissionReceiptV2;
type Action = 'submit' | 'find' | 'cancel';
type Pending = { owner: string; input: ResearchSubmissionV2 };
const noRunCodes = new Map([
  ['RESEARCH_V2_WRITES_DISABLED', 400],
  ['RESEARCH_INPUT_BUDGET_EXCEEDED', 400],
  ['RESEARCH_REQUIRED_EVIDENCE_UNAVAILABLE', 400],
  ['RESEARCH_SETTINGS_REVISION_CHANGED', 409],
]);
const messageFor = (error: unknown) =>
  error instanceof ThesisLedgerApiError
    ? (error.payload?.message ?? '服务端尚未确认，请按原提交找回。')
    : '请求未确认，请按原提交找回或原样重试。';

export function useResearchSubmission(
  mode: ResearchSubmissionV2['mode'],
  open: boolean,
  onCreated: (value: Receipt) => void,
) {
  const owner = useResearchIdentity();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const current = useRef({ owner, mode, open });
  current.current = { owner, mode, open };
  const pending = saved?.owner === owner && saved.input.mode === mode ? saved.input : null;
  useEffect(() => {
    if (!open) return;
    const input = readPendingResearch(owner, mode);
    setSaved(input ? { owner, input } : null);
    setError(null);
  }, [owner, mode, open]);
  useEffect(() => {
    current.current.open = open;
    return () => {
      current.current.open = false;
      controller.current?.abort('research_sheet_closed');
    };
  }, [owner, mode, open]);
  const mutation = useMutation({
    mutationKey: [...researchKeys.root, owner, mode, 'submission'],
    retry: false,
    mutationFn: async (variables: {
      owner: string;
      input: ResearchSubmissionV2;
      action: Action;
      signal: AbortSignal;
    }) => getDesktopApiClient().research[variables.action](variables.input, variables.signal),
    onSuccess: async (value, variables) => {
      savePendingResearch(variables.owner, null, variables.input.mode);
      await queryClient.invalidateQueries({ queryKey: researchKeys.root });
      if (
        !current.current.open ||
        (currentIdentitySession()?.principal.id ?? 'local-workspace') !== variables.owner ||
        current.current.owner !== variables.owner ||
        current.current.mode !== variables.input.mode
      )
        return;
      setSaved(null);
      onCreated(value);
    },
    onError: (failure, variables) => {
      if (
        !current.current.open ||
        current.current.owner !== variables.owner ||
        current.current.mode !== variables.input.mode
      )
        return;
      if (
        variables.action === 'submit' &&
        failure instanceof ThesisLedgerApiError &&
        noRunCodes.get(String(failure.payload?.errorCode ?? failure.payload?.error)) ===
          failure.status
      ) {
        savePendingResearch(owner, null, mode);
        setSaved(null);
        void queryClient.invalidateQueries({ queryKey: aiKeys.routingSettings() });
      }
      setError(messageFor(failure));
    },
  });
  const execute = (action: Action, draft?: Omit<ResearchSubmissionV2, 'submissionId'>) => {
    if (mutation.isPending) return;
    let input = pending;
    if (!input && draft)
      input = normalizeResearchSubmissionV2({ ...draft, submissionId: crypto.randomUUID() });
    if (!input) return;
    const savedLocally = savePendingResearch(owner, input, mode);
    if (!savedLocally) {
      setError('无法保留提交标识，请允许会话存储后重试。');
      return;
    }
    setSaved({ owner, input });
    setError(null);
    const next = new AbortController();
    controller.current = next;
    mutation.mutate({ owner, input, action, signal: next.signal });
  };
  return {
    pending,
    error,
    busy: mutation.isPending,
    action: mutation.variables?.action,
    submit: (draft: Omit<ResearchSubmissionV2, 'submissionId'>) => execute('submit', draft),
    retry: () => execute('submit'),
    find: () => execute('find'),
    cancel: () => execute('cancel'),
    stopWaiting: () => controller.current?.abort('research_preparation_cancelled'),
  };
}
