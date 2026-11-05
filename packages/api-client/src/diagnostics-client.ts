import {
  providerHealthPageSchema,
  providerHealthRecordSchema,
  providerIssueRecordSchema,
  notificationFailureRecordSchema,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';
export function diagnosticsClient(request: ParsedRequest) {
  return {
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
    issues: (status = 'open', signal?: AbortSignal) =>
      request(
        `/data-quality/issues?status=${encodeURIComponent(status)}`,
        providerIssueRecordSchema.array(),
        { signal: signal ?? null },
      ),
    notificationFailures: (signal?: AbortSignal) =>
      request('/notifications?status=failed', notificationFailureRecordSchema.array(), {
        signal: signal ?? null,
      }),
  };
}
