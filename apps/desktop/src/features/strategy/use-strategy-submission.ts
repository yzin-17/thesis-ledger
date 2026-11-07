import { createClientRequestId } from '../../lib/client-request-id';
import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StrategySubmissionInput } from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
export const submissionKey = ['desktop', 'strategy', 'submissions'] as const;
export function useStrategySubmission() {
  const client = useQueryClient();
  const pending = useRef<{ signature: string; id: string; input: StrategySubmissionInput } | null>(
    null,
  );
  const command = useMutation({
    retry: false,
    mutationFn: (choice: { signature: string; input: StrategySubmissionInput }) => {
      if (pending.current?.signature !== choice.signature)
        pending.current = { ...choice, id: createClientRequestId() };
      return getDesktopApiClient().strategySubmissions.submit(
        pending.current.id,
        pending.current.input,
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: submissionKey }),
  });
  return command;
}
