import { useMutation, useQueryClient } from '@tanstack/react-query';
import { commitImportDraft, rollbackImportDraft, uploadScreenshotImport } from './import.api.js';
import { importKeys } from './import.queries.js';
import type { ImportDraftRecord, ImportRow } from './import.types.js';

export const useUploadScreenshotImportMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: File; accountId: string; source: ImportDraftRecord['source'] }) =>
      uploadScreenshotImport(input),
    onSuccess: (_, input) =>
      client.invalidateQueries({ queryKey: importKeys.drafts(input.accountId) }),
  });
};

export const useCommitImportDraftMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      draftId,
      rows,
      source,
    }: {
      draftId: string;
      rows: ImportRow[];
      source: ImportDraftRecord['source'];
    }) => commitImportDraft(draftId, { rows, source }),
    onSuccess: () => client.invalidateQueries({ queryKey: importKeys.root }),
  });
};

export const useRollbackImportDraftMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) => rollbackImportDraft(draftId),
    onSuccess: () => client.invalidateQueries({ queryKey: importKeys.root }),
  });
};
