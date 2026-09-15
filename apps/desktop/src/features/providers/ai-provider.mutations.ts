import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  deleteAiProvider,
  fetchAiProviderModels,
  saveAiProvider,
  setAiProviderEnabled,
  testAiProviderDraft,
  testSavedAiProvider,
} from './ai-provider.api.js';
import type { AiProviderInput } from './ai-provider.actions.js';
import type { AiProviderModelCatalogInput } from './ai-provider.api.js';
import { providerKeys } from './providers.queries.js';

const aiCapabilityKey = ['desktop', 'ai', 'capabilities'] as const;
const optimizationCapabilityKey = ['desktop', 'strategy', 'optimization', 'capabilities'] as const;

export const invalidateAiProviderState = (client: Pick<QueryClient, 'invalidateQueries'>) =>
  Promise.all([
    client.invalidateQueries({ queryKey: providerKeys.providers() }),
    client.invalidateQueries({ queryKey: aiCapabilityKey }),
    client.invalidateQueries({ queryKey: optimizationCapabilityKey }),
  ]);

export const invalidateAiProviderHealthState = (client: Pick<QueryClient, 'invalidateQueries'>) =>
  Promise.all([
    invalidateAiProviderState(client),
    client.invalidateQueries({ queryKey: providerKeys.healthHistoryRoot() }),
  ]);

const aiMutationOptions = {
  gcTime: 0,
  retry: false,
};

export const useSaveAiProviderMutation = () => {
  const client = useQueryClient();
  return useMutation({
    ...aiMutationOptions,
    mutationFn: (input: AiProviderInput) => saveAiProvider(input),
    onSuccess: (_result, input) =>
      input.connectionTestToken
        ? invalidateAiProviderHealthState(client)
        : invalidateAiProviderState(client),
  });
};

export const useTestAiProviderDraftMutation = () => {
  return useMutation({
    ...aiMutationOptions,
    mutationFn: (input: AiProviderInput) => testAiProviderDraft(input),
  });
};

export const useFetchAiProviderModelsMutation = () =>
  useMutation({
    ...aiMutationOptions,
    mutationFn: (input: AiProviderModelCatalogInput) => fetchAiProviderModels(input),
  });

export const useTestSavedAiProviderMutation = () => {
  const client = useQueryClient();
  return useMutation({
    ...aiMutationOptions,
    mutationFn: (name: string) => testSavedAiProvider(name),
    onSuccess: () => invalidateAiProviderHealthState(client),
  });
};

export const useSetAiProviderEnabledMutation = () => {
  const client = useQueryClient();
  return useMutation({
    ...aiMutationOptions,
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      setAiProviderEnabled(name, enabled),
    onSuccess: () => invalidateAiProviderState(client),
  });
};

export const useDeleteAiProviderMutation = () => {
  const client = useQueryClient();
  return useMutation({
    ...aiMutationOptions,
    mutationFn: (name: string) => deleteAiProvider(name),
    onSuccess: () => invalidateAiProviderState(client),
  });
};
