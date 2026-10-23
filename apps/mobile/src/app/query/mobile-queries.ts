import { onlineManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useMobileRuntime } from '../MobileRuntime';
import { performMobileWrite } from './perform-write';
import { mobileValuationOptions } from './valuation-query';
import { refreshAfterMobileWrite } from './refresh-after-write';

export function useAccounts() {
  const { api, scope } = useMobileRuntime();
  return useQuery({
    queryKey: [...scope, 'accounts'],
    queryFn: ({ signal }) => api.accounts.list({ mode: scope[2], includeInactive: true }, signal),
  });
}
export function useValuation(accountId?: string | null, enabled = true) {
  const { api, scope } = useMobileRuntime();
  return useQuery(mobileValuationOptions(api, scope, accountId, enabled));
}
export function useLedger(accountId: string | null) {
  const { api, scope } = useMobileRuntime();
  return useQuery({
    queryKey: [...scope, 'ledger', accountId],
    enabled: Boolean(accountId),
    queryFn: () => api.ledger.getEvents(accountId!),
  });
}
export function useMobileCommand<T, R>(
  execute: (input: T) => Promise<R>,
  options: { refresh?: boolean } = {},
) {
  const { scope } = useMobileRuntime();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationKey: ['mobile-write', ...scope],
    retry: false,
    networkMode: 'always',
    mutationFn: (input: T) =>
      performMobileWrite({
        online: onlineManager.isOnline(),
        execute: () => execute(input),
        refresh: () => {
          if (options.refresh === false) return Promise.resolve();
          return refreshAfterMobileWrite(client, scope);
        },
      }),
  });
  const inFlight = useRef<ReturnType<typeof mutation.mutateAsync> | null>(null);
  const submit = (input: T) => {
    if (inFlight.current) return inFlight.current;
    const operation = mutation.mutateAsync(input).finally(() => {
      if (inFlight.current === operation) inFlight.current = null;
    });
    inFlight.current = operation;
    return operation;
  };
  return { ...mutation, mutateAsync: submit };
}
