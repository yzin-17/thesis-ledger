import {
  riskRuleInputSchema,
  riskRuleUpdateSchema,
  riskRuleResponseSchema,
  riskRulesResponseSchema,
  riskEventsResponseSchema,
  riskScanContextSchema,
  riskScanEnvelopeSchema,
  riskTestResultsResponseSchema,
  riskScanResponseSchema,
  riskAuditResponseSchema,
  riskNotificationsResponseSchema,
  notificationRoutingResponseSchema,
  omitUndefinedDeep,
} from '@thesis-ledger/schemas';
type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
type Request = <T>(path: string, schema: Schema<T>, init?: RequestInit) => Promise<T>;
export function riskManagementClient(request: Request) {
  const rulePath = (id: string) => `/risk/rules/${encodeURIComponent(id)}`;
  const write = <T>(path: string, schema: Schema<T>, body?: unknown, method = 'POST') =>
    request(path, schema, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const read = <T>(path: string, schema: Schema<T>, signal?: AbortSignal) =>
    request(path, schema, { cache: 'no-store', ...(signal ? { signal } : {}) });
  return {
    getRules: (params: { includeArchived?: boolean } = {}, signal?: AbortSignal) =>
      read(
        `/risk/rules${params.includeArchived ? '?includeArchived=true' : ''}`,
        riskRulesResponseSchema,
        signal,
      ),
    getEvents(
      params: { mode?: 'actual' | 'shadow'; cursor?: string; limit?: number; t?: number } = {},
      signal?: AbortSignal,
    ) {
      const query = new URLSearchParams(
        Object.entries(params)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      );
      return read(
        `/risk/events${query.size ? `?${query}` : ''}`,
        riskEventsResponseSchema
          .refine((rows) => !params.mode || rows.every((row) => row.mode === params.mode))
          .transform(omitUndefinedDeep),
        signal,
      );
    },
    createRule: (input: unknown) =>
      write('/risk/rules', riskRuleResponseSchema, riskRuleInputSchema.parse(input)),
    patchRule: (id: string, input: unknown) =>
      write(
        rulePath(id),
        riskRuleResponseSchema.refine((rule) => rule.id === id),
        riskRuleUpdateSchema.parse(input),
        'PATCH',
      ),
    archiveRule: (id: string) =>
      write(
        rulePath(id),
        riskRuleResponseSchema.refine((rule) => rule.id === id),
        undefined,
        'DELETE',
      ),
    restoreRule: (id: string) =>
      write(
        `${rulePath(id)}/restore`,
        riskRuleResponseSchema.refine((rule) => rule.id === id),
      ),
    testRule: (id: string, contexts: unknown) =>
      write(
        `${rulePath(id)}/test`,
        riskTestResultsResponseSchema,
        riskScanContextSchema.array().parse(contexts),
      ),
    scan: (input: unknown) =>
      write('/risk/scan', riskScanResponseSchema, riskScanEnvelopeSchema.parse(input)),
    getAudit: (id: string, signal?: AbortSignal) =>
      read(`${rulePath(id)}/audit`, riskAuditResponseSchema, signal),
    getNotifications: (signal?: AbortSignal) =>
      read('/notifications', riskNotificationsResponseSchema, signal),
    getRouting: (signal?: AbortSignal) =>
      read('/notifications/routing', notificationRoutingResponseSchema, signal),
  };
}
