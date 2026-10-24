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

const suffix = (input: object) =>
  '?' +
  new URLSearchParams(
    Object.entries(input)
      .filter(([, v]) => v !== undefined && v !== 'all')
      .map(([k, v]) => [k, String(v)]),
  ).toString();
export function researchRunClient(request: ResearchRequestParsed) {
  return {
    list: (input: ResearchRunListInput = {}, signal?: AbortSignal) => {
      const query = researchRunListInputSchema.parse(input);
      return request(
        '/ai/runs' + suffix(query),
        {
          safeParse(raw: unknown) {
            return researchRunPageSchema.safeParse(
              Array.isArray(raw) ? { items: raw, nextCursor: null, hasMore: false } : raw,
            );
          },
        },
        { signal: signal ?? null },
      );
    },
    detail: (id: string, options: { view?: 'research' } = {}, signal?: AbortSignal) => {
      const runId = researchReportIdSchema.parse(id);
      return request(
        `/ai/runs/${runId}${suffix(options)}`,
        researchRunRecordSchema.refine((v) => v.id === runId),
        { signal: signal ?? null },
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
        { signal: signal ?? null },
      );
    },
    capabilities: (signal?: AbortSignal) =>
      request('/ai/runs/capabilities', aiCapabilitiesResponseSchema, { signal: signal ?? null }),
    strategies: (signal?: AbortSignal) =>
      request('/strategies', researchStrategyOptionsSchema, { signal: signal ?? null }),
    settings: (signal?: AbortSignal) =>
      request('/ai/settings', researchRoutingReadSchema, { signal: signal ?? null }),
    retryPrefill: (id: string, signal?: AbortSignal) => {
      const runId = researchReportIdSchema.parse(id);
      return request(
        `/ai/runs/${runId}/retry-prefill`,
        aiResearchRetryPrefillSchema.refine((v) => v.sourceRunId === runId),
        { signal: signal ?? null },
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
