import {
  compareMarketPitEvidenceInstantStringsV1,
  researchReportIdSchema,
  researchReportLocatorSchema,
  researchObservationReadQuerySchema,
  researchReportObservationsSchema,
  researchObservationSubmissionSchema,
  researchObservationSubmissionResultSchema,
  researchObservationHistorySchema,
  researchHistoricalScopeMatchesLocator,
  type ResearchObservationReadInput,
  type ResearchObservationSubmissionInput,
  type ResearchReportLocatorInput,
} from '@thesis-ledger/schemas';
import type { ResearchRequestParsed } from './research-client.js';

export function researchObservationClient(
  request: ResearchRequestParsed,
  queryString: (query: object) => string,
) {
  return {
    observations(id: string, input: ResearchObservationReadInput, signal?: AbortSignal) {
      const reportId = researchReportIdSchema.parse(id),
        query = researchObservationReadQuerySchema.parse(input);
      return request(
        `/research/reports/${reportId}/observations${queryString(query)}`,
        researchReportObservationsSchema.refine(
          (value) =>
            value.reportId === reportId &&
            researchHistoricalScopeMatchesLocator(value.historicalScope, query) &&
            (!query.asOf || compareMarketPitEvidenceInstantStringsV1(query.asOf, value.asOf) === 0),
        ),
        signal ? { signal } : undefined,
      );
    },
    review(
      id: string,
      input: ResearchReportLocatorInput,
      raw: ResearchObservationSubmissionInput,
      signal?: AbortSignal,
    ) {
      const reportId = researchReportIdSchema.parse(id),
        query = researchReportLocatorSchema.parse(input);
      const body = researchObservationSubmissionSchema.parse(raw);
      if (query.view === 'legacy') throw new Error('旧报告缺少自动复核所需的范围字段');
      return request(
        `/research/reports/${reportId}/observations${queryString(query)}`,
        researchObservationSubmissionResultSchema.refine(
          (value) =>
            value.reportId === reportId &&
            value.claimId === body.claimId &&
            value.attempt.submissionId === body.submissionId &&
            researchHistoricalScopeMatchesLocator(value.historicalScope, query) &&
            (!value.attempt.version ||
              compareMarketPitEvidenceInstantStringsV1(
                value.attempt.version.inputs.visibleAt,
                body.asOf,
              ) === 0),
        ),
        { method: 'POST', body: JSON.stringify(body), ...(signal ? { signal } : {}) },
      );
    },
    observationHistory(
      id: string,
      rawObservationId: string,
      input: ResearchReportLocatorInput,
      signal?: AbortSignal,
    ) {
      const reportId = researchReportIdSchema.parse(id),
        observationId = researchReportIdSchema.parse(rawObservationId);
      const query = researchReportLocatorSchema.parse(input);
      return request(
        `/research/reports/${reportId}/observations/${observationId}/versions${queryString(query)}`,
        researchObservationHistorySchema.refine(
          (value) =>
            value.reportId === reportId &&
            value.observationId === observationId &&
            researchHistoricalScopeMatchesLocator(value.historicalScope, query),
        ),
        signal ? { signal } : undefined,
      );
    },
  };
}
