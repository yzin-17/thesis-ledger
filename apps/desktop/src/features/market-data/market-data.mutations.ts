import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  confirmMarketInstrument,
  removeMarketProvider,
  retryMarketPolicy,
  saveMarketPolicy,
  startCatalogSync,
  testMarketProvider,
} from './market-data.api.js';
import { marketDataKeys } from './market-data.queries.js';
import type {
  MarketPolicyDraftV3,
  ProviderManifest,
  ProviderCredentialDraft,
} from './market-data.types.js';

export const useSaveMarketPolicyMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (policy: MarketPolicyDraftV3) => saveMarketPolicy(policy),
    onSuccess: async (policy) => {
      client.setQueryData(marketDataKeys.policy(), policy);
      await client.invalidateQueries({ queryKey: marketDataKeys.routeCapabilities() });
    },
  });
};

export const useRetryMarketPolicyMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: retryMarketPolicy,
    onSuccess: async (policy) => {
      client.setQueryData(marketDataKeys.policy(), policy);
      await client.invalidateQueries({ queryKey: marketDataKeys.routeCapabilities() });
    },
  });
};

export const useTestMarketProviderMutation = () =>
  useMutation({
    mutationFn: ({
      provider,
      credentials,
    }: {
      provider: ProviderManifest;
      credentials?: ProviderCredentialDraft;
    }) => testMarketProvider(provider, credentials),
  });

export const useRemoveMarketProviderMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (provider: ProviderManifest) => removeMarketProvider(provider.providerId),
    onSuccess: async (result) => {
      if (result.policy) client.setQueryData(marketDataKeys.policy(), result.policy);
      await Promise.all([
        client.invalidateQueries({ queryKey: marketDataKeys.providers() }),
        client.invalidateQueries({ queryKey: marketDataKeys.routeCapabilities() }),
      ]);
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
