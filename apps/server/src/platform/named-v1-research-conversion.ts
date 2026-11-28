import type { AiRun } from '@prisma/client';
import { ZodError } from 'zod';
import {
  correlateResearchResultV2,
  researchResultV2Schema,
} from '@thesis-ledger/schemas';
import {
  frozenResearchInputFingerprint,
  sealAiFrozenResearchV2,
  verifyAiFrozenResearchV2,
} from '../ai/ai-research-frozen-integrity-v2.js';
import {
  assertResearchResultModelBindingV2,
  assertResearchRunBindingV2,
} from '../ai/ai-research-run-binding-v2.js';
import { verifyResearchNumericEvidenceV2 } from '../ai/ai-research-numeric-evidence-v2.js';
import { hashCanonicalManifest } from '../backtest/backtest-snapshot.js';

type Json = Record<string, unknown>;
const record = (raw: unknown): Json | undefined =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Json : undefined;
const unable = (reason: string) => ({ outcome: 'unproven' as const, reason });
type Run = Pick<AiRun, 'id' | 'status' | 'question' | 'promptVersion' | 'researchOwnerId' |
  'researchSubmissionId' | 'researchInputDigest' | 'researchScopeSnapshot' | 'provider' |
  'model' | 'executionAttempt' | 'modelMetadata' | 'result'>;
type Call = { id: string; tool: string; inputSummary: string };

function generationContract(raw: unknown) {
  const ref = record(raw);
  return ref?.id === 'research' && ref.version === 'research-generation-v2'
    ? { ...ref, version: 'research-report-generation-v1' } : raw;
}

function executionMetadata(raw: Json) {
  const requests = Array.isArray(raw.requests) ? raw.requests.map((value: unknown) => {
    const request = record(value);
    const outcome = record(request?.outcome);
    return outcome ? { ...request, outcome: { ...outcome,
      contract: generationContract(outcome.contract) } } : value;
  }) : raw.requests;
  return { ...raw, contract: generationContract(raw.contract), requests };
}

/** 仅处理已结束研究。模型原始输出、调用审计和资料字节保留原有身份。 */
export function previewResearchConversion(run: Run, calls: readonly Call[]) {
  if (run.status === 'queued' || run.status === 'running')
    return unable('研究仍有待投递或在途请求');
  const metadata = record(run.modelMetadata);
  const frozen = record(metadata?.frozenResearch);
  const request = record(frozen?.request);
  const scope = record(frozen?.scopeSnapshot);
  if (!metadata || frozen?.version !== 'frozen-research-v2' || frozen.resultVersion !== 2 ||
      request?.version !== 2 || scope?.version !== 'research-scope-v2' ||
      !Array.isArray(frozen.evidence))
    return unable('旧研究缺少可识别的冻结输入与范围');
  if (frozen.inputFingerprint !== frozenResearchInputFingerprint(frozen) ||
      hashCanonicalManifest(scope) !== hashCanonicalManifest(run.researchScopeSnapshot))
    return unable('旧研究冻结摘要或范围无法核验');
  const scopeSnapshot = { ...scope, version: 'research-scope-snapshot-v1' };
  let step = '冻结资料重封';
  try {
    const input = sealAiFrozenResearchV2({
      ...frozen,
      version: 'research-frozen-input-v1',
      resultVersion: 'research-report-result-v1',
      request: { ...request, version: 'research-report-submission-v1' },
      scopeSnapshot,
    });
    if (hashCanonicalManifest(input.evidence) !== hashCanonicalManifest(frozen.evidence))
      return unable('转换会改变冻结资料或原引用指纹');
    step = '冻结资料资格';
    verifyAiFrozenResearchV2(input);
    const execution = record(metadata.sdkExecution);
    const nextMetadata = {
      ...metadata,
      frozenResearch: input,
      ...(metadata.researchScopeSnapshot ? { researchScopeSnapshot: scopeSnapshot } : {}),
      ...(execution ? { sdkExecution: executionMetadata(execution),
        originalResearchExecution: execution } : {}),
    };
    const candidate = { ...run, researchScopeSnapshot: input.scopeSnapshot, modelMetadata: nextMetadata };
    step = '研究任务归属';
    assertResearchRunBindingV2(candidate, input);
    if (run.status !== 'succeeded')
      return run.result === null ? { outcome: 'convert' as const, row: candidate } :
        unable('未成功任务仍持有已生成报告');

    const raw = record(run.result);
    const inference = record(raw?.inference);
    if (raw?.version !== 2 || inference?.version !== 2 ||
        raw.inputFingerprint !== frozen.inputFingerprint ||
        hashCanonicalManifest(raw.scopeSnapshot) !== hashCanonicalManifest(scope))
      return unable('旧报告与冻结输入身份不一致');
    step = '报告字段';
    const result = researchResultV2Schema.parse({ ...raw, version: 'research-report-result-v1',
      inputFingerprint: input.inputFingerprint, scopeSnapshot,
      inference: { ...inference, version: 'research-report-generation-v1' } });
    step = '源证据与数值绑定';
    correlateResearchResultV2(input, result, calls.map(({ id }) => id));
    verifyResearchNumericEvidenceV2(input, result.inference);
    step = '报告模型绑定';
    assertResearchResultModelBindingV2(candidate as Run, result.model);
    const callById = new Map(calls.map((call) => [call.id, call]));
    for (const binding of result.evidenceBindings) {
      const call = callById.get(binding.toolCallId);
      const summary = record(call ? JSON.parse(call.inputSummary) : null);
      if (!call || call.tool !== `frozenEvidence_${binding.audit.evidenceId.replaceAll('-', '')}` ||
          summary?.evidenceId !== binding.audit.evidenceId ||
          summary?.fingerprint !== binding.audit.fingerprint)
        return unable('原工具审计无法对应报告材料');
    }
    return { outcome: 'convert' as const, row: { ...candidate, result } };
  } catch (error) {
    const paths = error instanceof ZodError ? error.issues.map((issue) =>
      issue.path.join('.') || (issue.code === 'custom' ? issue.message : issue.code),
    ) : [];
    const modelBinding = step === '报告模型绑定' && error instanceof Error ? error.message : '';
    return unable(step + '未通过校验' + (paths.length ? '：' + paths.join('、') : modelBinding ? '：' + modelBinding : ''));
  }
}

export type ResearchMigrationRun = Run;
export type ResearchMigrationCall = Call;
