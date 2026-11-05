import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AiRun, AiToolCall } from '@prisma/client';
import {
  researchResultV2Schema,
  researchReportDetailSchema,
  correlateResearchResultV2,
  type AiFrozenResearchV2,
  type ResearchResultV2,
} from '@thesis-ledger/schemas';
import {
  sealAiFrozenResearchV2,
  verifyAiFrozenResearchV2,
} from '../../src/ai/ai-research-frozen-integrity-v2.js';
import { researchSubmissionDigestV2 } from '../../src/ai/ai-research-submission-identity-v2.js';
import { assertResearchRunBindingV2 } from '../../src/ai/ai-research-run-binding-v2.js';
import { verifyResearchNumericEvidenceV2 } from '../../src/ai/ai-research-numeric-evidence-v2.js';

export const comparisonOwner = '10000000-0000-4000-8000-000000000001';

/** 合成冻结合同；只使用受控样例，不执行模型或来源请求。 */
export function comparisonReport(
  options: {
    id?: string;
    completedAt?: Date;
    frozen?: (value: AiFrozenResearchV2) => void;
    result?: (value: ResearchResultV2) => void;
  } = {},
) {
  let bytes = readFileSync(
    new URL('../../../../packages/schemas/fixtures/research-v2.samples.json', import.meta.url),
    'utf8',
  );
  const original = JSON.parse(bytes) as { evidenceId: string; toolCallId: string };
  bytes = bytes
    .replaceAll(original.evidenceId, randomUUID())
    .replaceAll(original.toolCallId, randomUUID());
  const sample = JSON.parse(bytes) as { frozen: AiFrozenResearchV2; result: ResearchResultV2 };
  sample.frozen.request.submissionId = randomUUID();
  sample.frozen.evidence[0]!.numericFields = [
    { fieldPath: '/price', unit: 'price', currency: 'CNY' },
  ];
  options.frozen?.(sample.frozen);
  const frozen = sealAiFrozenResearchV2(sample.frozen);
  verifyAiFrozenResearchV2(frozen);
  const candidate: ResearchResultV2 = {
    ...sample.result,
    inputFingerprint: frozen.inputFingerprint,
    scopeSnapshot: frozen.scopeSnapshot,
    promptVersion: frozen.prompt.version,
    quality: frozen.quality,
    model: { ...sample.result.model, researchSettingsRevision: frozen.researchSettingsRevision },
    evidenceBindings: sample.result.evidenceBindings.map((binding) => ({
      ...binding,
      audit: frozen.evidence.find((entry) => entry.audit.evidenceId === binding.audit.evidenceId)!
        .audit,
    })),
  };
  options.result?.(candidate);
  const result = researchResultV2Schema.parse(candidate);
  const id = options.id ?? randomUUID();
  const completedAt = options.completedAt ?? new Date(Date.parse(result.createdAt) + 60_000);
  const row = {
    id,
    status: 'succeeded',
    question: frozen.request.question,
    provider: result.model.providerId,
    model: result.model.modelId,
    promptVersion: frozen.prompt.version,
    researchOwnerId: comparisonOwner,
    researchSubmissionId: frozen.request.submissionId,
    researchInputDigest: researchSubmissionDigestV2(frozen.request),
    researchScopeSnapshot: frozen.scopeSnapshot,
    modelMetadata: { frozenResearch: frozen },
    context: {},
    result,
    createdAt: new Date(result.createdAt),
    updatedAt: completedAt,
    completedAt,
    errorCode: null,
    errorSummary: null,
  } as unknown as AiRun;
  const calls = result.evidenceBindings.map(
    ({ toolCallId, audit }) =>
      ({
        id: toolCallId,
        aiRunId: id,
        status: 'ok',
        tool: `frozenEvidence_${audit.evidenceId.replaceAll('-', '')}`,
        permission: 'evidence:read',
        provider: audit.providerId,
        inputSummary: JSON.stringify({
          evidenceId: audit.evidenceId,
          fingerprint: audit.fingerprint,
        }),
      }) as AiToolCall,
  );
  assertResearchRunBindingV2(row, frozen);
  correlateResearchResultV2(
    frozen,
    result,
    calls.map((call) => call.id),
  );
  verifyResearchNumericEvidenceV2(frozen, result.inference);
  const detail = researchReportDetailSchema.parse({
    id,
    status: 'succeeded',
    question: row.question,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    historicalScope: { status: 'known', snapshot: frozen.scopeSnapshot },
    resultVersion: 2,
    availability: 'available',
    summary: result.inference.conclusion,
    quality: frozen.quality,
    errorCode: null,
    errorSummary: null,
    result,
    submission: frozen.request,
  });
  return { row, calls, source: { detail, frozen } };
}
