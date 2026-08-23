import { useQuery } from '@tanstack/react-query';
import { fetchImportDrafts } from './import.api.js';

export const importKeys = {
  root: ['desktop', 'import'] as const,
  drafts: (accountId: string) => [...importKeys.root, 'drafts', accountId] as const,
};

export const useImportDraftsQuery = (accountId: string) =>
  useQuery({
    queryKey: importKeys.drafts(accountId || 'none'),
    queryFn: () => {
      if (!accountId) throw new Error('import account id is required');
      return fetchImportDrafts(accountId);
    },
    enabled: Boolean(accountId),
  });
