import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  confirmMarketInstrument,
  removeMarketProvider,
  saveMarketPolicy,
  startCatalogSync,
  testMarketProvider,
} from './market-data.api.js';
import { marketDataKeys } from './market-data.queries.js';
import type { MarketPolicy, ProviderManifest, ProviderCredentialDraft } from './market-data.types.js';

export const useSaveMarketPolicyMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (policy: MarketPolicy) => saveMarketPolicy(policy),
    onSuccess: (policy) => client.setQueryData(marketDataKeys.policy(), policy),
  });
};

export const useTestMarketProviderMutation = () =>
  useMutation({
    mutationFn: ({ provider, credentials }: { provider: ProviderManifest; credentials?: ProviderCredentialDraft }) =>
      testMarketProvider(provider, credentials),
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
