import {
  researchRunRecordSchema,
  researchRunPageSchema,
  researchRunListInputSchema,
  researchRoutingReadSchema,
  aiCapabilitiesResponseSchema,
  aiResearchRetryPrefillSchema,
  aiToolCallsPageSchema,
  aiRunCursorSchema,
  researchReportIdSchema,
  aiResearchStartInputSchema,
  aiRunStartInputSchema,
  type ResearchRunListInput,
  researchStrategyOptionsSchema,
  researchRunReceiptSchema,
} from '@thesis-ledger/schemas';
import type { ResearchRequestParsed } from './research-client.js';

const suffix = (input: object) => {
  const query = new URLSearchParams(
    Object.entries(input)
      .filter(([, v]) => v !== undefined && v !== 'all')
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  return query ? '?' + query : '';
};
const readInit = (signal?: AbortSignal): RequestInit | undefined =>
  signal ? { signal } : undefined;
export function researchRunClient(request: ResearchRequestParsed) {
  return {
    list: (input: ResearchRunListInput = {}, signal?: AbortSignal) => {
      const { view, limit, status, search, source, includeInternal, sort, cursor } =
        researchRunListInputSchema.parse(input);
      const query = {
        view,
        limit,
        status,
        search,
        source,
        includeInternal: includeInternal || undefined,
        sort,
        cursor,
      };
      return request(
        '/ai/runs' + suffix(query),
        {
          safeParse(raw: unknown) {
            return researchRunPageSchema.safeParse(
              Array.isArray(raw) ? { items: raw, nextCursor: null, hasMore: false } : raw,
            );
          },
        },
        readInit(signal),
      );
    },
    detail: (id: string, options: { view?: 'research' } = {}, signal?: AbortSignal) => {
      const runId = researchReportIdSchema.parse(id);
      return request(
        `/ai/runs/${runId}${suffix(options)}`,
        researchRunRecordSchema.refine((v) => v.id === runId),
        readInit(signal),
      );
    },
    tools: (id: string, filter: { limit?: number; cursor?: string } = {}, signal?: AbortSignal) => {
      const runId = researchReportIdSchema.parse(id);
      const limit = researchRunListInputSchema.shape.limit.parse(filter.limit);
      const cursor =
        filter.cursor === undefined ? undefined : aiRunCursorSchema.parse(filter.cursor);
      return request(
        `/ai/runs/${runId}/tool-calls${suffix({ limit, cursor })}`,
        aiToolCallsPageSchema,
        readInit(signal),
      );
    },
    capabilities: (signal?: AbortSignal) =>
      request('/ai/runs/capabilities', aiCapabilitiesResponseSchema, readInit(signal)),
    strategies: (signal?: AbortSignal) =>
      request('/strategies', researchStrategyOptionsSchema, readInit(signal)),
    settings: (signal?: AbortSignal) =>
      request('/ai/settings', researchRoutingReadSchema, readInit(signal)),
    retryPrefill: (id: string, signal?: AbortSignal) => {
      const runId = researchReportIdSchema.parse(id);
      return request(
        `/ai/runs/${runId}/retry-prefill`,
        aiResearchRetryPrefillSchema.refine((v) => v.sourceRunId === runId),
        readInit(signal),
      );
    },
    create: (input: unknown, signal?: AbortSignal) => {
      const body = aiResearchStartInputSchema.or(aiRunStartInputSchema).parse(input);
      return request('/ai/runs', researchRunReceiptSchema, {
        method: 'POST',
        body: JSON.stringify(body),
        signal: signal ?? null,
      });
    },
  };
}
