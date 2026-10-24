import { researchRunClient } from '@thesis-ledger/api-client';
import { omitUndefinedDeep } from '@thesis-ledger/schemas';
import { parsedDesktopRequest, type DesktopRequestClient } from '../shared/request.js';
import type {
  AiRunDetail,
  AiRunFilterStatus,
  AiRunSourceFilter,
  AiRunPage,
  CreateAiRunInput,
  AiRunResult,
} from './ai.types.js';
export interface AiRunListFilter {
  view?: 'research';
  status?: Exclude<AiRunFilterStatus, 'all'>;
  search?: string;
  source?: AiRunSourceFilter;
  includeInternal?: boolean;
  sort?: 'updated_desc';
  limit?: number;
  cursor?: string;
}
const isClient = (v: unknown): v is DesktopRequestClient =>
  Boolean(v && typeof v === 'object' && 'request' in v);
const api = (client?: DesktopRequestClient) => researchRunClient(parsedDesktopRequest(client));
export const fetchAiRuns = (
  filterOrClient?: AiRunListFilter | DesktopRequestClient,
  maybeClient?: DesktopRequestClient,
): Promise<AiRunPage> => {
  const filter = isClient(filterOrClient) ? {} : (filterOrClient ?? {});
  return api(isClient(filterOrClient) ? filterOrClient : maybeClient)
    .list(filter)
    .then(omitUndefinedDeep);
};
export const fetchAiRun = (
  id: string,
  optionsOrClient?: { view?: 'research' } | DesktopRequestClient,
  maybeClient?: DesktopRequestClient,
): Promise<AiRunDetail> =>
  api(isClient(optionsOrClient) ? optionsOrClient : maybeClient)
    .detail(id, isClient(optionsOrClient) ? {} : (optionsOrClient ?? {}))
    .then(omitUndefinedDeep);
export const fetchAiToolCalls = (
  id: string,
  filter: { limit?: number; cursor?: string } = {},
  client?: DesktopRequestClient,
) => api(client).tools(id, filter);
export const fetchAiCapabilities = (client?: DesktopRequestClient) => api(client).capabilities();
export const fetchAiRoutingSettings = (client?: DesktopRequestClient) => api(client).settings();
export const fetchAiResearchRetryPrefill = (id: string, client?: DesktopRequestClient) =>
  api(client).retryPrefill(id);
export const createAiRun = (
  input: CreateAiRunInput,
  client?: DesktopRequestClient,
): Promise<AiRunResult> => api(client).create(input).then(omitUndefinedDeep);
