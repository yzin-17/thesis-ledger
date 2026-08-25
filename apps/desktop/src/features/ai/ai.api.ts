import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type {
  AiRunDetail,
  AiRunFilterStatus,
  AiRunPage,
  AiRunRecord,
  AiRunResult,
  AiToolCallsPage,
  AiCapabilitiesResponse,
  CreateAiRunInput,
} from './ai.types.js';

export interface AiRunListFilter {
  status?: Exclude<AiRunFilterStatus, 'all'>;
  limit?: number;
  cursor?: string;
}

const isClient = (value: unknown): value is DesktopRequestClient =>
  Boolean(value && typeof value === 'object' && 'request' in value);

const listPath = (filter: AiRunListFilter) => {
  const params = new URLSearchParams();
  params.set('limit', String(filter.limit ?? 50));
  if (filter.status) params.set('status', filter.status);
  if (filter.cursor) params.set('cursor', filter.cursor);
  return `/ai/runs?${params.toString()}`;
};

export const fetchAiRuns = (
  filterOrClient?: AiRunListFilter | DesktopRequestClient,
  maybeClient?: DesktopRequestClient,
) => {
  const filter = isClient(filterOrClient) ? {} : (filterOrClient ?? {});
  const client = isClient(filterOrClient) ? filterOrClient : maybeClient;
  return requestDesktopJson<AiRunPage | AiRunRecord[]>(listPath(filter), undefined, client).then(
    (payload) =>
      Array.isArray(payload) ? { items: payload, nextCursor: null, hasMore: false } : payload,
  );
};

export const fetchAiRun = (id: string, client?: DesktopRequestClient) =>
  requestDesktopJson<AiRunDetail>(`/ai/runs/${encodeURIComponent(id)}`, undefined, client);

export const fetchAiToolCalls = (
  id: string,
  filter: { limit?: number; cursor?: string } = {},
  client?: DesktopRequestClient,
) => {
  const params = new URLSearchParams();
  params.set('limit', String(filter.limit ?? 50));
  if (filter.cursor) params.set('cursor', filter.cursor);
  return requestDesktopJson<AiToolCallsPage>(
    `/ai/runs/${encodeURIComponent(id)}/tool-calls?${params.toString()}`,
    undefined,
    client,
  );
};

export const fetchAiCapabilities = (client?: DesktopRequestClient) =>
  requestDesktopJson<AiCapabilitiesResponse>('/ai/runs/capabilities', undefined, client);

export const createAiRun = (input: CreateAiRunInput, client?: DesktopRequestClient) =>
  requestDesktopJson<AiRunResult>(
    '/ai/runs',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );
