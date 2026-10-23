import type { AiRun, AiToolCall, Prisma } from '@prisma/client';
import {
  correlateResearchResultV2,
  researchResultSchema,
  researchResultV2Schema,
  researchReportDetailSchema,
  type AiFrozenResearchV2,
  type ResearchReportDetail,
} from '@thesis-ledger/schemas';
import { verifyAiFrozenResearchV2 } from './ai-research-frozen-integrity-v2.js';
import { assertResearchRunBindingV2 } from './ai-research-run-binding-v2.js';
import { verifyResearchNumericEvidenceV2 } from './ai-research-numeric-evidence-v2.js';
import { safeDiagnosticSummary } from './ai-execution-read-model.js';

export type ResearchReadProjection = {
  detail: ResearchReportDetail;
  frozen: AiFrozenResearchV2 | null;
  calls: AiToolCall[];
};
type Scope = ResearchReportDetail['historicalScope'];
function emptyDetail(row: AiRun, historicalScope: Scope): ResearchReportDetail {
  let availability: ResearchReportDetail['availability'] = 'missing';
  if (row.status === 'queued' || row.status === 'running') availability = 'pending';
  return {
    id: row.id,
    status: row.status,
    question: row.question,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    historicalScope,
    resultVersion: historicalScope.status === 'known' ? 2 : 1,
    availability,
    summary: null,
    quality: null,
    errorCode: row.errorCode,
    errorSummary: safeDiagnosticSummary(row.errorSummary),
    result: null,
    submission: null,
  };
}
function invalid(
  detail: ResearchReportDetail,
  availability: 'invalid' | 'unsupported' = 'invalid',
): ResearchReadProjection {
  return {
    detail: researchReportDetailSchema.parse({
      ...detail,
      availability,
      resultVersion: availability === 'unsupported' ? null : detail.resultVersion,
      result: null,
      summary: null,
    }),
    frozen: null,
    calls: [],
  };
}
async function ownedCalls(transaction: Prisma.TransactionClient, runId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0 || unique.length > 1000) return [];
  return transaction.aiToolCall.findMany({
    where: { aiRunId: runId, id: { in: unique }, status: 'ok' },
    take: 1000,
  });
}
function correctFrozenCall(call: AiToolCall, evidenceId: string, fingerprint: string) {
  if (call.tool !== `frozenEvidence_${evidenceId.replaceAll('-', '')}`) return false;
  try {
    const summary = JSON.parse(call.inputSummary) as {
      evidenceId?: unknown;
      fingerprint?: unknown;
    };
    return summary.evidenceId === evidenceId && summary.fingerprint === fingerprint;
  } catch {
    return false;
  }
}
async function v2Projection(
  transaction: Prisma.TransactionClient,
  row: AiRun,
  detail: ResearchReportDetail,
): Promise<ResearchReadProjection> {
  let frozen: AiFrozenResearchV2;
  try {
    const metadata = row.modelMetadata as Record<string, unknown> | null;
    frozen = verifyAiFrozenResearchV2(metadata?.frozenResearch);
    assertResearchRunBindingV2(row, frozen);
  } catch {
    return invalid(detail);
  }
  detail.submission = frozen.request;
  detail.quality = frozen.quality;
  if (row.status !== 'succeeded')
    return { detail: researchReportDetailSchema.parse(detail), frozen, calls: [] };
  const parsed = researchResultV2Schema.safeParse(row.result);
  if (!parsed.success) return invalid(detail);
  const result = parsed.data;
  const calls = await ownedCalls(
    transaction,
    row.id,
    result.evidenceBindings.map((binding) => binding.toolCallId),
  );
  try {
    correlateResearchResultV2(
      frozen,
      result,
      calls.map((call) => call.id),
    );
    verifyResearchNumericEvidenceV2(frozen, result.inference);
    if (result.model.providerId !== row.provider || result.model.modelId !== row.model)
      throw new Error('结果模型与结算任务不一致');
    const byId = new Map(calls.map((call) => [call.id, call]));
    for (const binding of result.evidenceBindings) {
      const call = byId.get(binding.toolCallId);
      if (!call || !correctFrozenCall(call, binding.audit.evidenceId, binding.audit.fingerprint))
        throw new Error('引用未绑定实际冻结 Tool');
    }
    return {
      detail: researchReportDetailSchema.parse({
        ...detail,
        availability: 'available',
        result,
        summary: result.inference.conclusion,
      }),
      frozen,
      calls,
    };
  } catch {
    return invalid(detail);
  }
}
async function legacyProjection(
  transaction: Prisma.TransactionClient,
  row: AiRun,
  detail: ResearchReportDetail,
): Promise<ResearchReadProjection> {
  if (row.status !== 'succeeded')
    return { detail: researchReportDetailSchema.parse(detail), frozen: null, calls: [] };
  if (
    row.result &&
    typeof row.result === 'object' &&
    !Array.isArray(row.result) &&
    row.result.version !== 1
  )
    return invalid(detail, 'unsupported');
  const parsed = researchResultSchema.safeParse(row.result);
  if (!parsed.success) return invalid(detail);
  const references = parsed.data.evidence.flatMap((entry) =>
    entry.citations.map((citation) => citation.toolCallId),
  );
  const ids = references.filter((id): id is string => Boolean(id));
  const calls = await ownedCalls(transaction, row.id, ids);
  if (
    !references.length ||
    ids.length !== references.length ||
    ids.some((id) => !calls.some((call) => call.id === id))
  )
    return {
      detail: researchReportDetailSchema.parse({
        ...detail,
        result: parsed.data,
        summary: parsed.data.conclusion,
        availability: 'pending_verification',
      }),
      frozen: null,
      calls: [],
    };
  return {
    detail: researchReportDetailSchema.parse({
      ...detail,
      result: parsed.data,
      summary: parsed.data.conclusion,
      availability: 'available',
    }),
    frozen: null,
    calls,
  };
}
/** 查询只验证保存的产物和审计事实；数据库错误继续向上传播。 */
export function projectResearchReport(
  transaction: Prisma.TransactionClient,
  row: AiRun,
  scope: Scope,
) {
  const detail = emptyDetail(row, scope);
  if (scope.status === 'known') return v2Projection(transaction, row, detail);
  return legacyProjection(transaction, row, detail);
}
