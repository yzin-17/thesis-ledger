import {
  automationCreateInputSchema,
  automationUpdateInputSchema,
  automationRecordSchema,
  automationHistoryPageSchema,
  automationHistoryRecordSchema,
  automationRunResultSchema,
  type AutomationCreateInput,
  type AutomationUpdateInput,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';
const path = (id: string) => `/automations/${encodeURIComponent(id)}`;
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
export function automationClient(request: ParsedRequest) {
  return {
    list: (signal?: AbortSignal) =>
      request('/automations', automationRecordSchema.array(), { signal: signal ?? null }),
    create: (input: AutomationCreateInput) => {
      automationCreateInputSchema.parse(input);
      return request(
        '/automations',
        automationRecordSchema.refine((row) => row.id === input.id),
        json('POST', input),
      );
    },
    update: (id: string, input: AutomationUpdateInput) => {
      automationUpdateInputSchema.parse(input);
      return request(
        path(id),
        automationRecordSchema.refine((row) => row.id === id),
        json('PATCH', input),
      );
    },
    setEnabled: (id: string, enabled: boolean) => {
      if (typeof enabled !== 'boolean') throw new Error('任务启停必须是布尔值');
      return request(
        `${path(id)}/enabled`,
        automationRecordSchema.refine((row) => row.id === id),
        json('PATCH', { enabled }),
      );
    },
    remove: (id: string) =>
      request(
        path(id),
        automationRecordSchema.refine((row) => row.id === id),
        json('DELETE'),
      ),
    run: (id: string) => request(`${path(id)}/run`, automationRunResultSchema, json('POST')),
    history: async (page = 1, jobId?: string, signal?: AbortSignal) => {
      if (!Number.isInteger(page) || page < 1) throw new Error('页码必须为正整数');
      const query = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (jobId) query.set('jobId', jobId);
      const result = await request(
        `/automations/history?${query}`,
        automationHistoryPageSchema.or(automationHistoryRecordSchema.array()),
        { signal: signal ?? null, cache: 'no-store' },
      );
      if (!Array.isArray(result)) return result;
      const totalPages = Math.ceil(result.length / 20);
      const currentPage = totalPages === 0 ? 1 : Math.min(page, totalPages);
      return {
        items: result.slice((currentPage - 1) * 20, currentPage * 20),
        page: currentPage,
        pageSize: 20,
        total: result.length,
        totalPages,
      };
    },
  };
}
