import { useQuery } from '@tanstack/react-query';
import {
  fetchAutomationHistory,
  fetchAutomationFailures,
  fetchProviderFailures,
  fetchAutomationJobs,
  fetchNotificationFailures,
  fetchProviderHealthHistory,
  fetchProviderIssues,
  fetchProviders,
} from './providers.api.js';
import { fetchAiRoutingSettings } from './ai-provider.api.js';

export const providerKeys = {
  root: ['desktop', 'providers'] as const,
  providers: () => [...providerKeys.root, 'config'] as const,
  routingSettings: () => [...providerKeys.root, 'routing-settings'] as const,
  issues: () => [...providerKeys.root, 'issues'] as const,
  jobs: () => [...providerKeys.root, 'automations'] as const,
  healthHistoryRoot: () => [...providerKeys.root, 'health-history'] as const,
  healthHistory: (page: number) => [...providerKeys.root, 'health-history', page] as const,
  jobHistory: (page?: number, jobId?: string) =>
    [
      ...providerKeys.root,
      'automation-history',
      ...(page === undefined ? [] : [page]),
      ...(jobId ? ['job', jobId] : []),
    ] as const,
  notificationFailures: () => [...providerKeys.root, 'notification-failures'] as const,
  healthFailures: (page: number) => [...providerKeys.healthHistoryRoot(), 'issues', page] as const,
  automationFailures: (page: number) => [...providerKeys.jobHistory(), 'issues', page] as const,
};

export const useProviderQueries = (
  healthHistoryPage: number,
  automationHistoryPage: number,
  diagnostics?: {
    healthPage: number;
    automationPage: number;
    enabled: boolean;
    automationJobId?: string | undefined;
  },
) => ({
  healthFailures: useQuery({
    queryKey: providerKeys.healthFailures(diagnostics?.healthPage ?? 1),
    queryFn: ({ signal }) => fetchProviderFailures(diagnostics?.healthPage ?? 1, signal),
    enabled: diagnostics?.enabled ?? false,
    placeholderData: (previous) => previous,
  }),
  automationFailures: useQuery({
    queryKey: providerKeys.automationFailures(diagnostics?.automationPage ?? 1),
    queryFn: ({ signal }) => fetchAutomationFailures(diagnostics?.automationPage ?? 1, signal),
    enabled: diagnostics?.enabled ?? false,
    placeholderData: (previous) => previous,
  }),
  providers: useQuery({
    queryKey: providerKeys.providers(),
    queryFn: () => fetchProviders(),
  }),
  routingSettings: useQuery({
    queryKey: providerKeys.routingSettings(),
    queryFn: () => fetchAiRoutingSettings(),
  }),
  issues: useQuery({
    queryKey: providerKeys.issues(),
    queryFn: () => fetchProviderIssues(),
  }),
  jobs: useQuery({
    queryKey: providerKeys.jobs(),
    queryFn: () => fetchAutomationJobs(),
  }),
  healthHistory: useQuery({
    queryKey: providerKeys.healthHistory(healthHistoryPage),
    queryFn: () => fetchProviderHealthHistory(healthHistoryPage),
  }),
  jobHistory: useQuery({
    queryKey: providerKeys.jobHistory(automationHistoryPage, diagnostics?.automationJobId),
    queryFn: ({ signal }) =>
      fetchAutomationHistory(
        automationHistoryPage,
        undefined,
        diagnostics?.automationJobId,
        signal,
      ),
    meta: { automationJobId: diagnostics?.automationJobId ?? 'all' },
    placeholderData: (previous, query) =>
      query?.meta?.automationJobId === (diagnostics?.automationJobId ?? 'all')
        ? previous
        : undefined,
  }),
  notificationFailures: useQuery({
    queryKey: providerKeys.notificationFailures(),
    queryFn: () => fetchNotificationFailures(),
  }),
});
