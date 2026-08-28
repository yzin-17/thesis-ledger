import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  clearMarketProviderCredential,
  confirmMarketInstrument,
  removeMarketProvider,
  saveMarketPolicy,
  saveMarketProvider,
  startCatalogSync,
  testMarketProvider,
} from './market-data.api.js';
import { marketDataKeys } from './market-data.queries.js';
import type { MarketPolicy, ProviderManifest } from './market-data.types.js';

export const useSaveMarketPolicyMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (policy: MarketPolicy) => saveMarketPolicy(policy),
    onSuccess: (policy) => client.setQueryData(marketDataKeys.policy(), policy),
  });
};

export const useSaveMarketProviderMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, credential }: { provider: ProviderManifest; credential?: string }) =>
      saveMarketProvider(provider, credential),
    onSuccess: () => client.invalidateQueries({ queryKey: marketDataKeys.providers() }),
  });
};

export const useClearMarketProviderCredentialMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: clearMarketProviderCredential,
    onSuccess: () => client.invalidateQueries({ queryKey: marketDataKeys.providers() }),
  });
};

export const useTestMarketProviderMutation = () =>
  useMutation({
    mutationFn: ({ provider, credential }: { provider: ProviderManifest; credential?: string }) =>
      testMarketProvider(provider, credential),
  });

export const useRemoveMarketProviderMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (provider: ProviderManifest) => removeMarketProvider(provider.providerId),
    onSuccess: async (result) => {
      if (result.policy) client.setQueryData(marketDataKeys.policy(), result.policy);
      await client.invalidateQueries({ queryKey: marketDataKeys.providers() });
    },
  });
};

export const useCatalogSyncMutation = () => useMutation({ mutationFn: startCatalogSync });

export const useConfirmInstrumentMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: confirmMarketInstrument,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: [...marketDataKeys.root, 'instruments'] }),
  });
};
