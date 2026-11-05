import {
  optimizationRunPreparationRequestSchema,
  optimizationRunPreparationResultSchema,
  type OptimizationRunPreparationRequest,
  optimizationAdoptSchema,
  optimizationAdoptionContextSchema,
  optimizationAdoptionReadSchema,
  optimizationCompareReadSchema,
  optimizationDetailReadSchema,
  optimizationExperimentCloneSchema,
  optimizationExperimentCreateSchema,
  optimizationExperimentReadSchema,
  optimizationExperimentRenameSchema,
  optimizationFinalizeSchema,
  optimizationListInputSchema,
  optimizationPageReadSchema,
  strategyBacktestGroupPageSchema,
  strategyManagementIdSchema,
  strategyOptimizationCapabilitiesReadSchema,
  strategyParameterDescriptorSchema,
  monitoringPlanSchema,
  type OptimizationExperimentCreate,
  type OptimizationExperimentRead,
  type OptimizationListInput,
} from '@thesis-ledger/schemas';
import type { ParsedRequest, ParsedResponseSchema } from './parsed-request.js';

const prefix = '/strategy-optimization';
const path = (id: string) =>
  `${prefix}/experiments/${encodeURIComponent(strategyManagementIdSchema.parse(id))}`;
export function strategyOptimizationClient(request: ParsedRequest) {
  const write = <T>(url: string, body: unknown, schema: ParsedResponseSchema<T>, method = 'POST') =>
    request(url, schema, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const summary = (id: string) => optimizationExperimentReadSchema.refine((v) => v.id === id);
  const query = (options: OptimizationListInput) => {
    optimizationListInputSchema.parse(options);
    const params = new URLSearchParams({ limit: String(options.limit ?? 50) });
    for (const [key, value] of Object.entries(options)) {
      if (key !== 'limit' && typeof value === 'string' && value.length > 0) params.set(key, value);
    }
    return params.toString();
  };
  return {
    prepare: async (input: OptimizationRunPreparationRequest, signal?: AbortSignal) => {
      const body=optimizationRunPreparationRequestSchema.parse(input);
      const response=await request(`${prefix}/run-config/prepare`,optimizationRunPreparationResultSchema,{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),...(signal?{signal}:{}) });
      if(response.requestId!==body.intent.requestId)throw Error('实验配置准备响应与当前请求不一致');
      return response;
    },
    capabilities: (signal?: AbortSignal) =>
      request(`${prefix}/capabilities`, strategyOptimizationCapabilitiesReadSchema, {
        signal: signal ?? null,
      }),
    parameters: (versionId: string, signal?: AbortSignal) =>
      request(
        `${prefix}/strategies/${encodeURIComponent(strategyManagementIdSchema.parse(versionId))}/parameters`,
        strategyParameterDescriptorSchema.array(),
        { signal: signal ?? null },
      ),
    monitoringPlan: (versionId: string, signal?: AbortSignal) =>
      request(
        `${prefix}/strategies/${encodeURIComponent(strategyManagementIdSchema.parse(versionId))}/monitoring-plan`,
        monitoringPlanSchema.refine(
          (v) => !v.strategyVersionId || v.strategyVersionId === versionId,
        ),
        { signal: signal ?? null },
      ),
    list: (options: OptimizationListInput = {}, signal?: AbortSignal) =>
      request(`${prefix}/experiments?${query(options)}`, optimizationPageReadSchema, {
        cache: 'no-store',
        signal: signal ?? null,
      }),
    groups: (options: OptimizationListInput = {}, signal?: AbortSignal) =>
      request(`${prefix}/backtests/groups?${query(options)}`, strategyBacktestGroupPageSchema, {
        cache: 'no-store',
        signal: signal ?? null,
      }),
    read: (id: string, signal?: AbortSignal) =>
      request(
        path(id),
        optimizationDetailReadSchema.refine((v) => v.experiment.id === id),
        { cache: 'no-store', signal: signal ?? null },
      ),
    compare: (id: string, signal?: AbortSignal) =>
      request(
        `${path(id)}/compare`,
        optimizationCompareReadSchema.refine((v) => v.experiment.id === id),
        { cache: 'no-store', signal: signal ?? null },
      ),
    create: (input: OptimizationExperimentCreate): Promise<OptimizationExperimentRead> => {
      const body = optimizationExperimentCreateSchema.parse(input);
      return write(`${prefix}/experiments`, body, optimizationExperimentReadSchema);
    },
    clone: (
      id: string,
      input: { name?: string; acknowledgeUnknownCost?: boolean; idempotencyKey: string },
    ) =>
      write(
        `${path(id)}/clone`,
        optimizationExperimentCloneSchema.parse(input),
        optimizationExperimentReadSchema,
      ),
    rename: (id: string, name: string) =>
      write(path(id), optimizationExperimentRenameSchema.parse({ name }), summary(id), 'PATCH'),
    cancel: (id: string) => write(`${path(id)}/cancel`, {}, summary(id)),
    finalize: (
      id: string,
      input: {
        candidateIds: string[];
        selectedCandidateId: string;
        expectedStage: 'awaiting_finalization';
      },
    ) =>
      write(
        `${path(id)}/finalize`,
        optimizationFinalizeSchema.parse(input),
        optimizationCompareReadSchema.refine((v) => v.experiment.id === id),
      ),
    adoptionContext: (id: string, candidateId: string, signal?: AbortSignal) =>
      request(
        `${path(id)}/adopt-context?candidateId=${encodeURIComponent(strategyManagementIdSchema.parse(candidateId))}`,
        optimizationAdoptionContextSchema.refine(
          (v) => v.experimentId === id && v.candidateId === candidateId,
        ),
        { signal: signal ?? null },
      ),
    adopt: (
      id: string,
      input: {
        candidateId: string;
        candidateHash: string;
        expectedStrategyVersion: number;
        idempotencyKey: string;
        acknowledgeTestExposure?: boolean;
      },
    ) => {
      const body = optimizationAdoptSchema.parse(input);
      return write(
        `${path(id)}/adopt`,
        body,
        optimizationAdoptionReadSchema.refine(
          (v) =>
            v.adoptionContext.experimentId === id &&
            v.adoptionContext.candidateId === body.candidateId &&
            v.adoptionContext.candidate.executionHash === body.candidateHash,
        ),
      );
    },
  };
}
