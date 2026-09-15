import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type {
  AiProviderModelDetail,
  ProviderConnectionTestResult,
  ProviderRecord,
} from './providers.types.js';
import type { AiProviderInput } from './ai-provider.actions.js';

export type AiProviderTestResult = ProviderConnectionTestResult & { testToken?: string };
export type AiProviderModelCatalogInput = {
  name?: string;
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
};
export type AiProviderModelCatalogResult = {
  models: string[];
  modelDetails: AiProviderModelDetail[];
  fetchedAt: string;
};

const noStore = { cache: 'no-store' as const };
const jsonInit = (method: 'POST' | 'PATCH', body: unknown): RequestInit => ({
  ...noStore,
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const fetchAiProviders = (client?: DesktopRequestClient) =>
  requestDesktopJson<ProviderRecord[]>('/ai/providers', noStore, client);

export const saveAiProvider = (input: AiProviderInput, client?: DesktopRequestClient) =>
  requestDesktopJson<ProviderRecord>('/ai/providers', jsonInit('POST', input), client);

export const testAiProviderDraft = (input: AiProviderInput, client?: DesktopRequestClient) =>
  requestDesktopJson<AiProviderTestResult>('/ai/providers/test', jsonInit('POST', input), client);

export const fetchAiProviderModels = (
  input: AiProviderModelCatalogInput,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<AiProviderModelCatalogResult>(
    '/ai/providers/models',
    jsonInit('POST', input),
    client,
  );

export const testSavedAiProvider = (name: string, client?: DesktopRequestClient) =>
  requestDesktopJson<AiProviderTestResult>(
    `/ai/providers/${encodeURIComponent(name)}/test`,
    { ...noStore, method: 'POST' },
    client,
  );

export const setAiProviderEnabled = (
  name: string,
  enabled: boolean,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<ProviderRecord>(
    `/ai/providers/${encodeURIComponent(name)}/enabled`,
    jsonInit('PATCH', { enabled }),
    client,
  );

export const deleteAiProvider = (name: string, client?: DesktopRequestClient) =>
  requestDesktopJson<ProviderRecord>(
    `/ai/providers/${encodeURIComponent(name)}`,
    { ...noStore, method: 'DELETE' },
    client,
  );
