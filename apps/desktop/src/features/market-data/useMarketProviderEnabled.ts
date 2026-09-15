import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import {
  providerEnabledMutationKey,
  providerEnabledMutationOptions,
  type ProviderEnabledChange,
} from './market-provider-enabled.js';
import type { ProviderManifest } from './market-data.types.js';

export function useMarketProviderEnabled(providers: ProviderManifest[]) {
  const client = useQueryClient();
  const mutation = useMutation(providerEnabledMutationOptions(client));
  const inFlight = useRef(new Set<string>());
  const pending = useMutationState({
    filters: { mutationKey: providerEnabledMutationKey, status: 'pending' },
    select: (item) => item.state.variables as ProviderEnabledChange,
  });
  return {
    providers: providers.map((provider) => {
      const change = pending.find((item) => item.providerId === provider.providerId);
      return change ? { ...provider, enabled: change.enabled } : provider;
    }),
    pendingProviderIds: pending.map((item) => item.providerId),
    setEnabled: async (provider: ProviderManifest) => {
      if (inFlight.current.has(provider.providerId)) return;
      inFlight.current.add(provider.providerId);
      try {
        await mutation.mutateAsync({ providerId: provider.providerId, enabled: provider.enabled });
      } finally {
        inFlight.current.delete(provider.providerId);
      }
    },
  };
}
