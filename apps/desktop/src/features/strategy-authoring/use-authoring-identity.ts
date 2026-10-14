import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { identityContextSchema } from '@thesis-ledger/schemas';
import { requestDesktopJson } from '../shared/request.js';
import {
  currentIdentitySession,
  subscribeIdentitySession,
} from '../../shared/api/identity-session.js';

export function useAuthoringContext() {
  const session = useSyncExternalStore(
    subscribeIdentitySession,
    currentIdentitySession,
    () => null,
  );
  return useQuery({
    queryKey: ['desktop', 'identity-context', session?.token],
    queryFn: async () => identityContextSchema.parse(await requestDesktopJson('/identity/context')),
    retry: false,
    staleTime: Infinity,
  });
}

export function useAuthoringIdentity() {
  const context = useAuthoringContext();
  return context.data?.principal ? { principal: context.data.principal } : null;
}
