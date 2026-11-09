import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { identityContextSchema } from '@thesis-ledger/schemas';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { requestDesktopJson } from '../shared/request.js';
import {
  currentIdentitySession,
  subscribeIdentitySession,
} from '../../shared/api/identity-session.js';

export const authoringContextQueryOptions = (token: string | undefined) => ({
  queryKey: ['desktop', 'identity-context', token],
  queryFn: async ({ signal }: { signal: AbortSignal }) =>
    identityContextSchema.parse(await requestDesktopJson('/identity/context', { signal })),
  retry: (failureCount: number, error: Error) =>
    error instanceof ThesisLedgerApiError && error.status === 429 && failureCount < 1,
  retryDelay: (_attempt: number, error: Error) =>
    error instanceof ThesisLedgerApiError ? (error.retryAfterMs ?? 60_000) : 0,
  staleTime: Infinity,
});

export function useAuthoringContext() {
  const session = useSyncExternalStore(
    subscribeIdentitySession,
    currentIdentitySession,
    () => null,
  );
  return useQuery(authoringContextQueryOptions(session?.token));
}

export function useAuthoringIdentity() {
  const context = useAuthoringContext();
  return context.data?.principal ? { principal: context.data.principal } : null;
}
