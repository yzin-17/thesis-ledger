import { useQuery } from '@tanstack/react-query';
import {
  fetchAutomationHistory,
  fetchAutomationJobs,
  fetchNotificationFailures,
  fetchProviderHealthHistory,
  fetchProviderIssues,
  fetchProviders,
} from './providers.api.js';

export const providerKeys = {
  root: ['desktop', 'providers'] as const,
  providers: () => [...providerKeys.root, 'config'] as const,
  issues: () => [...providerKeys.root, 'issues'] as const,
  jobs: () => [...providerKeys.root, 'automations'] as const,
  healthHistory: (page: number) => [...providerKeys.root, 'health-history', page] as const,
  jobHistory: () => [...providerKeys.root, 'automation-history'] as const,
  notificationFailures: () => [...providerKeys.root, 'notification-failures'] as const,
};

export const useProviderQueries = (healthHistoryPage: number) => ({
  providers: useQuery({
    queryKey: providerKeys.providers(),
    queryFn: () => fetchProviders(),
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
    queryKey: providerKeys.jobHistory(),
    queryFn: () => fetchAutomationHistory(),
  }),
  notificationFailures: useQuery({
    queryKey: providerKeys.notificationFailures(),
    queryFn: () => fetchNotificationFailures(),
  }),
});
