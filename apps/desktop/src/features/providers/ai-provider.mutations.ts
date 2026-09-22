import { useRef } from 'react';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { saveWithValidation, cancelValidatedSave } from './ai-provider-validated-save.js';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  deleteAiProvider,
  fetchAiProviderModels,
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
  const { confirm } = useConfirmDialog();
  const active = useRef<{ name: string; operationId: string; controller: AbortController } | null>(
    null,
  );
  const mutation = useMutation({
    ...aiMutationOptions,
    mutationFn: async (input: AiProviderInput) => {
      if (active.current) throw new Error('验证正在进行，请勿重复保存');
      const request = {
        name: input.name,
        operationId: crypto.randomUUID(),
        controller: new AbortController(),
      };
      active.current = request;
      try {
        return await saveWithValidation(
          input,
          confirm,
          request.operationId,
          request.controller.signal,
        );
      } finally {
        if (active.current === request) active.current = null;
      }
    },
    onSettled: () => invalidateAiProviderHealthState(client),
  });
  return {
    ...mutation,
    cancelSave: () => {
      const request = active.current;
      if (!request) return;
      void cancelValidatedSave(request.name, request.operationId).catch(() => undefined);
      request.controller.abort();
    },
  };
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
    mutationFn: ({
      name,
      enabled,
      ...lifecycle
    }: {
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
