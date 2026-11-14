import {
  providerHealthPageSchema,
  providerHealthRecordSchema,
  providerIssueRecordSchema,
  notificationFailureRecordSchema,
  automationHistoryPageSchema,
  automationHistoryRecordSchema,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';

const healthFailuresPage = providerHealthPageSchema.extend({
  items: providerHealthRecordSchema
    .refine(
      (item) =>
        ['degraded', 'down'].includes(item.state) &&
        !['pending', 'operation_authorized', 'validation_cancelled'].includes(item.errorCode ?? ''),
    )
    .array(),
});
const automationFailuresPage = automationHistoryPageSchema.extend({
  items: automationHistoryRecordSchema
    .refine((item) => ['failed', 'unknown_outcome', 'partial', 'interrupted'].includes(item.status))
    .array(),
});

export function diagnosticsClient(request: ParsedRequest) {
  return {
    healthFailures: (page = 1, signal?: AbortSignal) => {
      if (!Number.isInteger(page) || page < 1) throw new Error('页码必须为正整数');
      return request(`/providers/health/issues?page=${page}&pageSize=20`, healthFailuresPage, {
        signal: signal ?? null,
        cache: 'no-store',
      });
    },
    automationFailures: (page = 1, signal?: AbortSignal) => {
      if (!Number.isInteger(page) || page < 1) throw new Error('页码必须为正整数');
      return request(`/automations/issues?page=${page}&pageSize=20`, automationFailuresPage, {
        signal: signal ?? null,
        cache: 'no-store',
      });
    },
    healthHistory: async (page = 1, signal?: AbortSignal) => {
      if (!Number.isInteger(page) || page < 1) throw new Error('页码必须为正整数');
      const result = await request(
        `/providers/health/history?page=${page}&pageSize=20`,
        providerHealthPageSchema.or(providerHealthRecordSchema.array()),
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
    issues: (status = 'unresolved', signal?: AbortSignal) =>
      request(
        `/data-quality/issues?status=${encodeURIComponent(status)}`,
        providerIssueRecordSchema.array(),
        { signal: signal ?? null },
      ),
    notificationFailures: (signal?: AbortSignal) =>
      request('/notifications?status=failed,retrying', notificationFailureRecordSchema.array(), {
        signal: signal ?? null,
        cache: 'no-store',
      }),
  };
}
