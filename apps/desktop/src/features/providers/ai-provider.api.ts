import { parsedDesktopRequest, type DesktopRequestClient } from '../shared/request.js';
import { aiProviderClient } from '@thesis-ledger/api-client';
import type { AiProviderModelDetail, ProviderConnectionTestResult } from './providers.types.js';
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

const isDesktopRequestClient = (value: unknown): value is DesktopRequestClient =>
  Boolean(value && typeof value === 'object' && 'request' in value);

const lifecycleFromArgument = (
  value: string | AiProviderLifecycleOptions | DesktopRequestClient | undefined,
): AiProviderLifecycleOptions => {
  if (typeof value === 'string') return { expectedRevision: value };
  if (isDesktopRequestClient(value)) return {};
  return value ?? {};
};

export const desktopAiProviderClient = (client?: DesktopRequestClient) =>
  aiProviderClient(parsedDesktopRequest(client));

export const fetchAiProviders = (client?: DesktopRequestClient) =>
  desktopAiProviderClient(client).list();
export const fetchAiRoutingSettings = (client?: DesktopRequestClient) =>
  desktopAiProviderClient(client).settings();
export const updateAiRoutingSettings = (
  input: AiRoutingSettingsUpdate,
  client?: DesktopRequestClient,
) => desktopAiProviderClient(client).updateSettings(input);
export const saveAiProvider = (input: AiProviderInput, client?: DesktopRequestClient) =>
  desktopAiProviderClient(client).save(input);
export const testAiProviderDraft = (
  input: AiProviderTestInput,
  client?: DesktopRequestClient,
  signal?: AbortSignal,
) => desktopAiProviderClient(client).testDraft(input, signal);
export const cancelAiProviderTest = (
  name: string,
  requestId: string,
  client?: DesktopRequestClient,
) => desktopAiProviderClient(client).cancelTest(name, requestId);
export const fetchAiProviderModels = (
  input: AiProviderModelCatalogInput,
  client?: DesktopRequestClient,
) => desktopAiProviderClient(client).models(input);
export const testSavedAiProvider = (
  name: string,
  optionsOrClient: AiProviderTestRequestOptions | DesktopRequestClient = {},
  client?: DesktopRequestClient,
) => {
  const isClient = isDesktopRequestClient(optionsOrClient);
  const options = isClient ? {} : optionsOrClient;
  const { signal, ...body } = options;
  return desktopAiProviderClient(isClient ? optionsOrClient : client).test(name, body, signal);
};
export const setAiProviderEnabled = (
  name: string,
  enabled: boolean,
  argument?: string | AiProviderLifecycleOptions | DesktopRequestClient,
  client?: DesktopRequestClient,
) =>
  desktopAiProviderClient(isDesktopRequestClient(argument) ? argument : client).setEnabled(
    name,
    enabled,
    lifecycleFromArgument(argument),
  );
export const deleteAiProvider = (
  name: string,
  argument?: string | AiProviderLifecycleOptions | DesktopRequestClient,
  client?: DesktopRequestClient,
) =>
  desktopAiProviderClient(isDesktopRequestClient(argument) ? argument : client).remove(
    name,
    lifecycleFromArgument(argument),
  );
