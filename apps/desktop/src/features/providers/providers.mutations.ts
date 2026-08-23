import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  saveProvider,
  testProviderConnection,
  testProviderDraft,
  toggleAutomation,
} from './providers.api.js';
import { providerKeys } from './providers.queries.js';
import type { AutomationJob, SaveProviderInput } from './providers.types.js';

export const useTestProviderConnectionMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => testProviderConnection(name),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: providerKeys.root });
    },
  });
};

export const useTestProviderDraftMutation = () =>
  useMutation({ mutationFn: (input: SaveProviderInput) => testProviderDraft(input) });

export const useSaveProviderMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveProviderInput) => saveProvider(input),
    onSuccess: () => client.invalidateQueries({ queryKey: providerKeys.root }),
  });
};

export const useToggleAutomationMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, enabled }: { jobId: string; enabled: boolean }) =>
      toggleAutomation(jobId, enabled),
    onSuccess: (updatedJob, variables) => {
      client.setQueryData<AutomationJob[]>(providerKeys.jobs(), (jobs) =>
        jobs?.map((job) =>
          job.id === variables.jobId
            ? { ...job, ...updatedJob, enabled: updatedJob.enabled ?? variables.enabled }
            : job,
        ),
      );
    },
  });
};
