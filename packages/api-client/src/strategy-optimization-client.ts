import {
  optimizationModelResolutionRequestSchema,
  backtestModelResolutionResultSchema,
  executionModelAccountingIssuesV3,
  type OptimizationModelResolutionRequest,
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
  optimizationRetryRequestSchema,
  type OptimizationRetryRequest,
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
  type OptimizationAdoptionRead,
} from '@thesis-ledger/schemas';
import type { ParsedRequest, ParsedResponseSchema } from './parsed-request.js';
import { ThesisLedgerApiError } from './api-error.js';

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
  const adoptionSource = (result: OptimizationAdoptionRead) => {
    if (result.detailsStatus === 'unavailable') return result.source;
    if (result.source) return result.source;
    return {
      experimentId: result.adoptionContext.experimentId,
      candidateId: result.adoptionContext.candidateId,
      candidateHash: result.adoptionContext.candidate.executionHash,
    };
  };
  const adoptionMatches = (result: OptimizationAdoptionRead, id: string, candidateId: string, hash?: string) => {
    const source = adoptionSource(result);
    if (source.experimentId !== id || source.candidateId !== candidateId || (hash && source.candidateHash !== hash)) return false;
    if (result.detailsStatus === 'unavailable') return true;
    return result.adoptionContext.experimentId === id && result.adoptionContext.candidateId === candidateId &&
      result.adoptionContext.candidate.executionHash === source.candidateHash &&
      (!result.monitoringPlan.strategyVersionId || result.monitoringPlan.strategyVersionId === result.strategyVersion.id);
  };
  const adoptionStatus = (id: string, candidateId: string, signal?: AbortSignal) => request(
    `${path(id)}/candidates/${encodeURIComponent(strategyManagementIdSchema.parse(candidateId))}/adoption`,
    optimizationAdoptionReadSchema.nullable().refine((value) => {
      if (!value) return true;
      return adoptionMatches(value, id, candidateId);
    }),
    { cache: 'no-store', signal: signal ?? null },
  );
  const query = (options: OptimizationListInput) => {
    optimizationListInputSchema.parse(options);
    const params = new URLSearchParams({ limit: String(options.limit ?? 50) });
    for (const [key, value] of Object.entries(options)) {
      if (key !== 'limit' && typeof value === 'string' && value.length > 0) params.set(key, value);
    }
    return params.toString();
  };
  return {
    resolveExecutionModel: async (input: OptimizationModelResolutionRequest, signal?: AbortSignal) => {
      const body = optimizationModelResolutionRequestSchema.parse(input);
      const result = await request(`${prefix}/run-config/execution-model`, backtestModelResolutionResultSchema, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: signal ?? null,
      });
      const instrument = body.target.sourceMode === 'discovery' ? body.target.discoveryScope.executionInstrument : null;
      if (result.status === 'available' && (
        result.model.scope.currency !== body.currency ||
        result.model.scope.range.start > body.startDate || result.model.scope.range.end < body.endDate ||
        (instrument && (result.model.scope.symbol !== instrument.symbol || result.model.scope.market !== instrument.market ||
          result.model.scope.instrumentType !== (instrument.assetType === 'stock' ? 'STOCK' : 'ETF'))) ||
        executionModelAccountingIssuesV3(result.model, body, 'normalized-series').length > 0
      )) throw new Error('实验执行设置与当前标的、日期、币种或价格口径不一致，请重新读取。');
      return result;
    },
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
    retry: (id: string, input: OptimizationRetryRequest) =>
      write(`${path(id)}/retry`, optimizationRetryRequestSchema.parse(input), summary(id)),
    finalize: (
      id: string,
      input: {
        candidateIds: string[];
        selectedCandidateId?: string | null;
        expectedStage: 'awaiting_finalization';
      },
    ) =>
      write(
        `${path(id)}/finalize`,
        optimizationFinalizeSchema.parse(input),
        optimizationCompareReadSchema.refine((v) => v.experiment.id === id),
      ),
    complete: (id: string) =>
      write(`${path(id)}/complete`, {}, optimizationCompareReadSchema.refine((v) => v.experiment.id === id)),
    adoptionContext: (id: string, candidateId: string, signal?: AbortSignal) =>
      request(
        `${path(id)}/adopt-context?candidateId=${encodeURIComponent(strategyManagementIdSchema.parse(candidateId))}`,
        optimizationAdoptionContextSchema.refine(
          (v) => v.experimentId === id && v.candidateId === candidateId,
        ),
        { signal: signal ?? null },
      ),
    adoptionStatus,
    adopt: async (
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
      try {
        return await write(
          `${path(id)}/adopt`, body,
          optimizationAdoptionReadSchema.refine((value) => adoptionMatches(value, id, body.candidateId, body.candidateHash)),
        );
      } catch (error) {
        try {
          const committed = await adoptionStatus(id, body.candidateId);
          if (committed && adoptionSource(committed).candidateHash === body.candidateHash) return committed;
        } catch { /* 读取失败不等于未提交，原意图由调用方保留。 */ }
        if (error instanceof ThesisLedgerApiError) {
          const code = error.payload?.errorCode ?? error.payload?.code ?? error.payload?.error;
          if (typeof code === 'string' && [
            'ADOPTION_NOT_REVEALED', 'ADOPTION_NOT_ELIGIBLE', 'ADOPTION_CANDIDATE_HASH_MISMATCH',
            'ADOPTION_SOURCE_MISMATCH', 'ADOPTION_STALE_BASELINE', 'ADOPTION_IDEMPOTENCY_CONFLICT',
            'ADOPTION_ALREADY_COMMITTED',
          ].includes(code)) throw error;
        }
        throw new ThesisLedgerApiError(0, {
          error: 'ADOPTION_OUTCOME_UNCONFIRMED',
          message: '采纳结果暂未确认，原提交信息已保留，请稍后重查。',
        });
      }
    },
  };
}
