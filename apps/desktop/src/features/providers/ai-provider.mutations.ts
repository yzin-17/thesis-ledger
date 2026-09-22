import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  deleteAiProvider,
  fetchAiProviderModels,
  saveAiProvider,
  setAiProviderEnabled,
  testAiProviderDraft,
  testSavedAiProvider,
  updateAiRoutingSettings,
} from './ai-provider.api.js';
import type { AiProviderInput, AiProviderTestInput } from './ai-provider.actions.js';
import type {
  AiProviderModelCatalogInput,
  AiProviderLifecycleOptions,
  AiProviderTestRequestOptions,
  AiRoutingSettings,
  AiRoutingSettingsUpdate,
} from './ai-provider.api.js';
import { providerKeys } from './providers.queries.js';

const aiCapabilityKey = ['desktop', 'ai', 'capabilities'] as const;
const aiRoutingSettingsKey = ['desktop', 'ai', 'routing-settings'] as const;
const optimizationCapabilityKey = ['desktop', 'strategy', 'optimization', 'capabilities'] as const;

export const invalidateAiProviderState = (client: Pick<QueryClient, 'invalidateQueries'>) =>
  Promise.all([
    client.invalidateQueries({ queryKey: providerKeys.providers() }),
    client.invalidateQueries({ queryKey: providerKeys.routingSettings() }),
    client.invalidateQueries({ queryKey: aiCapabilityKey }),
    client.invalidateQueries({ queryKey: aiRoutingSettingsKey }),
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

export const useUpdateAiRoutingSettingsMutation = () => {
  const client = useQueryClient();
  return useMutation<AiRoutingSettings, unknown, AiRoutingSettingsUpdate>({
    ...aiMutationOptions,
    mutationFn: (input) => updateAiRoutingSettings(input),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: providerKeys.routingSettings() }),
        client.invalidateQueries({ queryKey: aiRoutingSettingsKey }),
      ]),
  });
};

export const useTestAiProviderDraftMutation = () => {
  return useMutation({
    ...aiMutationOptions,
    mutationFn: ({ input, signal }: { input: AiProviderTestInput; signal?: AbortSignal }) =>
      testAiProviderDraft(input, undefined, signal),
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
    mutationFn: ({
      name,
      model,
      purpose,
      mode,
      budgetAuthorized,
      requestId,
      signal,
    }: { name: string } & Omit<AiProviderTestRequestOptions, 'testKind'>) =>
      testSavedAiProvider(name, {
        ...(model === undefined ? {} : { model }),
        testKind: 'generation',
        ...(purpose === undefined ? {} : { purpose }),
        ...(mode === undefined ? {} : { mode }),
        ...(budgetAuthorized === undefined ? {} : { budgetAuthorized }),
        ...(requestId === undefined ? {} : { requestId }),
        ...(signal === undefined ? {} : { signal }),
      }),
    onSuccess: () => invalidateAiProviderHealthState(client),
  });
};

export const useSetAiProviderEnabledMutation = () => {
  const client = useQueryClient();
  return useMutation({
    ...aiMutationOptions,
    mutationFn: ({ name, enabled, ...lifecycle }: {
      name: string;
      enabled: boolean;
    } & AiProviderLifecycleOptions) => setAiProviderEnabled(name, enabled, lifecycle),
    onSuccess: () => invalidateAiProviderState(client),
  });
};

export const useDeleteAiProviderMutation = () => {
  const client = useQueryClient();
  return useMutation({
    ...aiMutationOptions,
    mutationFn: ({ name, ...lifecycle }: { name: string } & AiProviderLifecycleOptions) =>
      deleteAiProvider(name, lifecycle),
    onSuccess: () => invalidateAiProviderState(client),
  });
};
