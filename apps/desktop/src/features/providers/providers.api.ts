import { automationClient, diagnosticsClient } from '@thesis-ledger/api-client';
import { automationCreateInputSchema } from '@thesis-ledger/schemas';
import {
  parsedDesktopRequest,
  requestDesktopJson,
  type DesktopRequestClient,
} from '../shared/request.js';
import { sortProviderRecords } from './providers.types.js';
import type {
  CreateAutomationJobInput,
  ProviderConnectionTestResult,
  ProviderDraftTestResult,
  ProviderRecord,
  ProviderSaveResult,
  SaveProviderInput,
  UpdateAutomationJobInput,
} from './providers.types.js';
import { fetchAiProviders } from './ai-provider.api.js';

const noStore = { cache: 'no-store' as const };

const fetchConfiguredProviders = (client?: DesktopRequestClient) =>
  requestDesktopJson<ProviderRecord[]>('/providers/config', noStore, client);

/** AI 摘要只能来自专用端点，避免把旧通用记录当作可运行的 Registry 配置。 */
export const fetchProviders = async (client?: DesktopRequestClient) => {
  const [configured, aiProviders] = await Promise.all([
    fetchConfiguredProviders(client),
    fetchAiProviders(client),
  ]);
  return sortProviderRecords([
    ...configured.filter((provider) => provider.type !== 'ai'),
    ...aiProviders,
  ]);
};

const automation = (client?: DesktopRequestClient) =>
  automationClient(parsedDesktopRequest(client));
const diagnostics = (client?: DesktopRequestClient) =>
  diagnosticsClient(parsedDesktopRequest(client));
export const fetchProviderIssues = (client?: DesktopRequestClient) => diagnostics(client).issues();
export const fetchAutomationJobs = (client?: DesktopRequestClient) => automation(client).list();
export const fetchProviderHealthHistory = (page: number, client?: DesktopRequestClient) =>
  diagnostics(client).healthHistory(page);
export const fetchAutomationHistory = (page: number, client?: DesktopRequestClient) =>
  automation(client).history(page);
export const fetchNotificationFailures = (client?: DesktopRequestClient) =>
  diagnostics(client).notificationFailures();

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

export const toggleAutomation = (id: string, enabled: boolean, client?: DesktopRequestClient) =>
  automation(client).setEnabled(id, enabled);
export const createAutomationJob = (
  input: CreateAutomationJobInput,
  client?: DesktopRequestClient,
) => automation(client).create(automationCreateInputSchema.parse(input));
export const updateAutomationJob = (
  id: string,
  input: UpdateAutomationJobInput,
  client?: DesktopRequestClient,
) => automation(client).update(id, input);
export const deleteAutomationJob = (id: string, client?: DesktopRequestClient) =>
  automation(client).remove(id);
export const runAutomationJob = (id: string, client?: DesktopRequestClient) =>
  automation(client).run(id);
