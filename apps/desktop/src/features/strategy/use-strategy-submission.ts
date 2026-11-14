import { createClientRequestId } from '../../lib/client-request-id';
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StrategySubmissionInput } from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
export const submissionKey = ['desktop', 'strategy', 'submissions'] as const;
export function useStrategySubmission(onSubmitted?: () => void) {
  const client = useQueryClient();
  const api = getDesktopApiClient().strategySubmissions;
  const completed = useRef<string | null>(null);
  const pending = useRef<{ signature: string; id: string; input: StrategySubmissionInput } | null>(
    null,
  );
  const command = useMutation({
    retry: false,
    mutationFn: (choice: { signature: string; input: StrategySubmissionInput }) => {
      if (pending.current?.signature !== choice.signature)
        pending.current = { ...choice, id: createClientRequestId() };
      return api.submit(pending.current.id, pending.current.input);
    },
  });
  const receiptKey = [...submissionKey, command.data?.id];
  const progress = useQuery({
    queryKey: receiptKey,
    enabled: command.isSuccess,
    initialData: command.data,
    queryFn: async ({ signal }) => {
      const rows = await api.list(signal);
      const receipt = rows.find((row) => row.id === command.data?.id);
      if (!receipt) throw new Error('未读取到本次提交，请重新读取状态。');
      return receipt;
    },
    retry: false,
    refetchInterval: (query) => {
      if (query.state.error) return false;
      const state = query.state.data?.state;
      return state === 'submitted' || state === 'blocked' || state === 'awaiting_confirmation'
        ? false : 2000;
    },
    refetchIntervalInBackground: true,
  });
  const confirm = useMutation({
    mutationFn: () => {
      if (!command.data) throw new Error('请先提交回测。');
      return api.confirm(command.data.id);
    },
    retry: false,
    onSuccess: (receipt) => client.setQueryData(receiptKey, receipt),
  });
  const receipt = command.isSuccess ? progress.data : undefined;
  useEffect(() => {
    if (receipt?.state !== 'submitted' || !receipt.outcome?.id || completed.current === receipt.id) return;
    completed.current = receipt.id;
    void client.invalidateQueries({ queryKey: ['desktop', 'strategy', 'backtest-groups'] });
    void client.invalidateQueries({ queryKey: ['desktop', 'strategy', 'jobs'] });
    onSubmitted?.();
  }, [receipt, client, onSubmitted]);
  return {
    mutate: command.mutate,
    receipt,
    confirm,
    retry: () => void progress.refetch(),
    error: command.error ?? progress.error,
    isPending: command.isPending || Boolean(receipt && !progress.isError &&
      receipt.state !== 'submitted' && receipt.state !== 'blocked'),
  };
}
