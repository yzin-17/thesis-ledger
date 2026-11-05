import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ImportDraftReviewRecord,
  type ReviseImportDraftCommand,
  type SubmitImportDraftRevisionCommand,
} from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';

export const draftReviewKeys = {
  account: (accountId: string) => ['desktop', 'draft-review', accountId] as const,
};

export async function fetchDraftReviews(
  accountId: string,
  signal?: AbortSignal,
): Promise<ImportDraftReviewRecord[]> {
  return getDesktopApiClient().imports.getReviews(accountId, signal);
}

export const useDraftReviewsQuery = (accountId: string) =>
  useQuery({
    queryKey: draftReviewKeys.account(accountId),
    queryFn: ({ signal }) => fetchDraftReviews(accountId, signal),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

export const useDraftReviewMutations = (accountId: string) => {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: draftReviewKeys.account(accountId) });
  const revise = useMutation({
    mutationFn: (command: ReviseImportDraftCommand) =>
      getDesktopApiClient().ledger.reviseImportDraft(command),
    onSuccess: refresh,
  });
  const submit = useMutation({
    mutationFn: (command: SubmitImportDraftRevisionCommand) =>
      getDesktopApiClient().ledger.submitImportDraftRevision(command),
    onSuccess: refresh,
  });
  return { revise, submit };
};
