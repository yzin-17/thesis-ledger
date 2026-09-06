import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  createAutomationJob,
  deleteAutomationJob,
  runAutomationJob,
  saveProvider,
  testProviderConnection,
  testProviderDraft,
  toggleAutomation,
  updateAutomationJob,
} from './providers.api.js';
import { providerKeys } from './providers.queries.js';
import type {
  AutomationJob,
  CreateAutomationJobInput,
  SaveProviderInput,
  UpdateAutomationJobInput,
} from './providers.types.js';

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

const invalidateAutomationJobs = (client: QueryClient) => {
  void client.invalidateQueries({ queryKey: providerKeys.jobs() });
};

export const useCreateAutomationJobMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAutomationJobInput) => createAutomationJob(input),
    onSuccess: () => invalidateAutomationJobs(client),
  });
};

export const useUpdateAutomationJobMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, patch }: { jobId: string; patch: UpdateAutomationJobInput }) =>
      updateAutomationJob(jobId, patch),
    onSuccess: () => invalidateAutomationJobs(client),
  });
};

export const useDeleteAutomationJobMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => deleteAutomationJob(jobId),
    onSuccess: () => invalidateAutomationJobs(client),
  });
};

export const useRunAutomationJobMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => runAutomationJob(jobId),
    onSuccess: () => {
      invalidateAutomationJobs(client);
      void client.invalidateQueries({ queryKey: providerKeys.jobHistory() });
    },
  });
};
