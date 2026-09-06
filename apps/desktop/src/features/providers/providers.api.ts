import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import {
  normalizeProviderHealthHistory,
  PROVIDER_HEALTH_HISTORY_PAGE_SIZE,
} from './providers.types.js';
import type {
  AutomationHistoryRecord,
  AutomationJob,
  AutomationRunNowResult,
  CreateAutomationJobInput,
  NotificationFailureRecord,
  ProviderConnectionTestResult,
  ProviderDraftTestResult,
  ProviderIssueRecord,
  ProviderRecord,
  ProviderSaveResult,
  SaveProviderInput,
  UpdateAutomationJobInput,
} from './providers.types.js';

const noStore = { cache: 'no-store' as const };

export const fetchProviders = (client?: DesktopRequestClient) =>
  requestDesktopJson<ProviderRecord[]>('/providers/config', noStore, client);

export const fetchProviderIssues = (client?: DesktopRequestClient) =>
  requestDesktopJson<ProviderIssueRecord[]>('/data-quality/issues?status=open', noStore, client);

export const fetchAutomationJobs = (client?: DesktopRequestClient) =>
  requestDesktopJson<AutomationJob[]>('/automations', noStore, client);

export const fetchProviderHealthHistory = async (page: number, client?: DesktopRequestClient) => {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PROVIDER_HEALTH_HISTORY_PAGE_SIZE),
  });
  const payload = await requestDesktopJson<unknown>(
    `/providers/health/history?${params.toString()}`,
    noStore,
    client,
  );
  return normalizeProviderHealthHistory(payload, page, PROVIDER_HEALTH_HISTORY_PAGE_SIZE);
};

export const fetchAutomationHistory = (client?: DesktopRequestClient) =>
  requestDesktopJson<AutomationHistoryRecord[]>('/automations/history', noStore, client);

export const fetchNotificationFailures = (client?: DesktopRequestClient) =>
  requestDesktopJson<NotificationFailureRecord[]>('/notifications?status=failed', noStore, client);

export const testProviderConnection = (name: string, client?: DesktopRequestClient) =>
  requestDesktopJson<ProviderConnectionTestResult>(
    `/providers/config/${encodeURIComponent(name)}/test`,
    { ...noStore, method: 'POST' },
    client,
  );

export const testProviderDraft = (input: SaveProviderInput, client?: DesktopRequestClient) =>
  requestDesktopJson<ProviderDraftTestResult>(
    '/providers/config/test',
    {
      ...noStore,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );

export const saveProvider = (input: SaveProviderInput, client?: DesktopRequestClient) =>
  requestDesktopJson<ProviderSaveResult>(
    '/providers/config',
    {
      ...noStore,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );

export const toggleAutomation = (jobId: string, enabled: boolean, client?: DesktopRequestClient) =>
  requestDesktopJson<Partial<AutomationJob>>(
    `/automations/${encodeURIComponent(jobId)}/enabled`,
    {
      ...noStore,
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    },
    client,
  );

const automationJsonInit = (method: 'POST' | 'PATCH', body: unknown): RequestInit => ({
  ...noStore,
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const createAutomationJob = (
  input: CreateAutomationJobInput,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<AutomationJob>('/automations', automationJsonInit('POST', input), client);

export const updateAutomationJob = (
  jobId: string,
  patch: UpdateAutomationJobInput,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<AutomationJob>(
    `/automations/${encodeURIComponent(jobId)}`,
    automationJsonInit('PATCH', patch),
    client,
  );

export const deleteAutomationJob = (jobId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<AutomationJob>(
    `/automations/${encodeURIComponent(jobId)}`,
    { ...noStore, method: 'DELETE' },
    client,
  );

export const runAutomationJob = (jobId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<AutomationRunNowResult>(
    `/automations/${encodeURIComponent(jobId)}/run`,
    { ...noStore, method: 'POST' },
    client,
  );
