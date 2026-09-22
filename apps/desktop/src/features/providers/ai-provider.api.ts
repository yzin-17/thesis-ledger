import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type {
  AiProviderModelDetail,
  ProviderConnectionTestResult,
  ProviderRecord,
} from './providers.types.js';
import type { AiProviderInput, AiProviderTestInput } from './ai-provider.actions.js';
import type {
  AiGenerationContractRef,
  AiGenerationMode,
  AiUpstreamFormat,
} from '@thesis-ledger/schemas';
import type { AiAuthMode } from '@thesis-ledger/schemas';

export type AiProviderTestResult = ProviderConnectionTestResult & { testToken?: string };
export type AiProviderModelCatalogInput = {
  name?: string;
  baseUrl: string;
  authMode?: AiAuthMode;
  upstreamFormat?: AiUpstreamFormat;
  apiKey?: string;
  timeoutMs?: number;
};
export type AiProviderModelCatalogResult = {
  models: string[];
  modelDetails: AiProviderModelDetail[];
  fetchedAt: string;
};
export type AiRoutingSettingsCandidate = {
  providerId: string;
  providerName: string;
  model: string;
  enabled: boolean;
  health: string;
  authMode: AiAuthMode;
  priceConfigured: boolean;
};
export type AiRoutingSettings = {
  researchDefault: { providerId: string; model: string } | null;
  revision: string;
  candidates: AiRoutingSettingsCandidate[];
};
export type AiRoutingSettingsUpdate = {
  researchDefault: { providerId: string; model: string } | null;
  expectedRevision: string;
};
export type AiProviderLifecycleOptions = {
  expectedRevision?: string;
  clearResearchDefault?: boolean;
  expectedSettingsRevision?: string;
};

export type AiProviderTestRequestOptions = {
  model?: string;
  testKind?: 'connection' | 'generation';
  purpose?: AiGenerationContractRef['id'];
  mode?: AiGenerationMode;
  budgetAuthorized?: boolean;
  requestId?: string;
  signal?: AbortSignal;
};

const noStore = { cache: 'no-store' as const };
const jsonInit = (method: 'POST' | 'PATCH', body: unknown): RequestInit => ({
  ...noStore,
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const isDesktopRequestClient = (value: unknown): value is DesktopRequestClient =>
  Boolean(value && typeof value === 'object' && 'request' in value);

const lifecycleFromArgument = (
  value: string | AiProviderLifecycleOptions | DesktopRequestClient | undefined,
): AiProviderLifecycleOptions => {
  if (typeof value === 'string') return { expectedRevision: value };
  if (isDesktopRequestClient(value)) return {};
  return value ?? {};
};

export const fetchAiProviders = (client?: DesktopRequestClient) =>
  requestDesktopJson<ProviderRecord[]>('/ai/providers', noStore, client);

export const fetchAiRoutingSettings = (client?: DesktopRequestClient) =>
  requestDesktopJson<AiRoutingSettings>('/ai/settings', noStore, client);

export const updateAiRoutingSettings = (
  input: AiRoutingSettingsUpdate,
  client?: DesktopRequestClient,
) => requestDesktopJson<AiRoutingSettings>('/ai/settings', jsonInit('PATCH', input), client);

export const saveAiProvider = (input: AiProviderInput, client?: DesktopRequestClient) =>
  requestDesktopJson<ProviderRecord>('/ai/providers', jsonInit('POST', input), client);

export const testAiProviderDraft = (
  input: AiProviderTestInput,
  client?: DesktopRequestClient,
  signal?: AbortSignal,
) =>
  requestDesktopJson<AiProviderTestResult>(
    '/ai/providers/test',
    { ...jsonInit('POST', input), ...(signal === undefined ? {} : { signal }) },
    client,
  );

export const cancelAiProviderTest = (
  name: string,
  requestId: string,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<{ name: string; requestId: string; cancelled: boolean }>(
    `/ai/providers/${encodeURIComponent(name)}/test/cancel`,
    jsonInit('POST', { requestId }),
    client,
  );

export const fetchAiProviderModels = (
  input: AiProviderModelCatalogInput,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<AiProviderModelCatalogResult>(
    '/ai/providers/models',
    jsonInit('POST', input),
    client,
  );

export const testSavedAiProvider = (
  name: string,
  optionsOrClient: AiProviderTestRequestOptions | DesktopRequestClient = {},
  client?: DesktopRequestClient,
) => {
  const isClient = (value: typeof optionsOrClient): value is DesktopRequestClient =>
    'request' in value;
  const options = isClient(optionsOrClient) ? {} : optionsOrClient;
  const { signal, ...body } = options;
  return requestDesktopJson<AiProviderTestResult>(
    `/ai/providers/${encodeURIComponent(name)}/test`,
    {
      ...noStore,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    },
    isClient(optionsOrClient) ? optionsOrClient : client,
  );
};

export const setAiProviderEnabled = (
  name: string,
  enabled: boolean,
  expectedRevisionOrOptionsOrClient?: string | AiProviderLifecycleOptions | DesktopRequestClient,
  client?: DesktopRequestClient,
) => {
  const lifecycle = lifecycleFromArgument(expectedRevisionOrOptionsOrClient);
  return requestDesktopJson<ProviderRecord>(
    `/ai/providers/${encodeURIComponent(name)}/enabled`,
    jsonInit('PATCH', {
      enabled,
      ...lifecycle,
    }),
    isDesktopRequestClient(expectedRevisionOrOptionsOrClient)
      ? expectedRevisionOrOptionsOrClient
      : client,
  );
};

export const deleteAiProvider = (
  name: string,
  expectedRevisionOrOptionsOrClient?: string | AiProviderLifecycleOptions | DesktopRequestClient,
  client?: DesktopRequestClient,
) => {
  const lifecycle = lifecycleFromArgument(expectedRevisionOrOptionsOrClient);
  return requestDesktopJson<ProviderRecord>(
    `/ai/providers/${encodeURIComponent(name)}`,
    {
      ...noStore,
      method: 'DELETE',
      ...(Object.keys(lifecycle).length === 0
        ? {}
        : {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(lifecycle),
          }),
    },
    isDesktopRequestClient(expectedRevisionOrOptionsOrClient)
      ? expectedRevisionOrOptionsOrClient
      : client,
  );
};
