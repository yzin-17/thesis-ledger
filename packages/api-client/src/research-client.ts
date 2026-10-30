import {
  researchReportLocatorSchema,
  researchCapabilitiesV2Schema,
  researchReportListQuerySchema,
  researchReportPageSchema,
  researchReportDetailSchema,
  researchReportEvidenceSchema,
  researchReportMatchesLocator,
  researchHistoricalScopeMatchesLocator,
  researchReportComparisonQuerySchema,
  researchReportComparisonSchema,
  researchReportToolsQuerySchema,
  researchReportToolsPageSchema,
  normalizeResearchSubmissionV2,
  researchSubmissionReceiptV2Schema,
  researchScopeMatchesSubmissionV2,
  type ResearchSubmissionV2,
} from '@thesis-ledger/schemas';
import { researchObservationClient } from './research-observation-client.js';
import {
  researchReportIdSchema,
  type ResearchReportListInput,
  type ResearchReportLocatorInput,
  type ResearchReportComparisonInput,
  type ResearchReportToolsInput,
} from '@thesis-ledger/schemas';

type Parsed<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
export type ResearchRequestParsed = <T>(
  path: string,
  schema: Parsed<T>,
  init?: RequestInit,
) => Promise<T>;
const suffix = (query: object) =>
  '?' +
  new URLSearchParams(
    Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  ).toString();
const belongs = researchHistoricalScopeMatchesLocator;
const uuid = (value: string) => researchReportIdSchema.parse(value);

export function researchClient(request: ResearchRequestParsed) {
  const submit = (
    action: '' | '/find' | '/cancel',
    input: ResearchSubmissionV2,
    signal?: AbortSignal,
  ) => {
    const body = normalizeResearchSubmissionV2(input);
    return request(
      '/research/submissions' + action,
      researchSubmissionReceiptV2Schema.refine(
        (value) =>
          value.submissionId === body.submissionId.toLowerCase() &&
          researchScopeMatchesSubmissionV2(body, value.scopeSnapshot),
      ),
      { method: 'POST', body: JSON.stringify(body), ...(signal ? { signal } : {}) },
    );
  };
  return {
    ...researchObservationClient(request, suffix),
    capabilities: (signal?: AbortSignal) =>
      request(
        '/research/capabilities',
        researchCapabilitiesV2Schema,
        signal ? { signal } : undefined,
      ),
    submit: (input: ResearchSubmissionV2, signal?: AbortSignal) => submit('', input, signal),
    find: (input: ResearchSubmissionV2, signal?: AbortSignal) => submit('/find', input, signal),
    cancel: (input: ResearchSubmissionV2, signal?: AbortSignal) => submit('/cancel', input, signal),
    list: (input: ResearchReportListInput, signal?: AbortSignal) => {
      const query = researchReportListQuerySchema.parse(input);
      return request(
        '/research/reports' + suffix(query),
        researchReportPageSchema.refine((value) =>
          value.items.every((row) => belongs(row.historicalScope, query)),
        ),
        signal ? { signal } : undefined,
      );
    },
    detail: (id: string, input: ResearchReportLocatorInput, signal?: AbortSignal) => {
      const runId = uuid(id);
      const query = researchReportLocatorSchema.parse(input);
      return request(
        `/research/reports/${runId}${suffix(query)}`,
        researchReportDetailSchema.refine(
          (value) => value.id === runId && belongs(value.historicalScope, query),
        ),
        signal ? { signal } : undefined,
      );
    },
    tools: (id: string, input: ResearchReportToolsInput, signal?: AbortSignal) => {
      const runId = uuid(id);
      const query = researchReportToolsQuerySchema.parse(input);
      return request(
        `/research/reports/${runId}/tool-calls${suffix(query)}`,
        researchReportToolsPageSchema.refine((value) => value.runId === runId),
        signal ? { signal } : undefined,
      );
    },
    compare: (id: string, input: ResearchReportComparisonInput, signal?: AbortSignal) => {
      const runId = uuid(id);
      const query = researchReportComparisonQuerySchema.parse(input);
      if (query.beforeId === runId) throw new Error('请选择另一份研究报告');
      return request(
        `/research/reports/${runId}/comparison${suffix(query)}`,
        researchReportComparisonSchema.refine((value) => {
          if (value.current.id !== runId || !belongs(value.current.historicalScope, query))
            return false;
          if (query.beforeId) {
            if (value.selection !== 'explicit' || value.previous?.id !== query.beforeId)
              return false;
          } else if (
            value.selection !== 'default' ||
            (value.previous && !belongs(value.previous.historicalScope, query))
          )
            return false;
          return (
            value.status !== 'compared' ||
            !value.previous ||
            belongs(value.previous.historicalScope, query)
          );
        }),
        signal ? { signal } : undefined,
      );
    },
    evidence: (
      id: string,
      referenceId: string,
      input: ResearchReportLocatorInput,
      signal?: AbortSignal,
    ) => {
      const runId = uuid(id),
        reference = uuid(referenceId);
      const query = researchReportLocatorSchema.parse(input);
      return request(
        `/research/reports/${runId}/evidence/${reference}${suffix(query)}`,
        researchReportEvidenceSchema.refine((value) => {
          if (value.runId !== runId) return false;
          if (value.version === 1)
            return value.toolCall.id === reference && query.view === 'legacy';
          return (
            value.evidence.audit.evidenceId === reference &&
            query.view === 'scoped' &&
            researchReportMatchesLocator(value.scopeSnapshot, query)
          );
        }),
        signal ? { signal } : undefined,
      );
    },
  };
}
