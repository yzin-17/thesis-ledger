import {
  correlateResearchResultV2,
  type AiFrozenResearchV2,
  type ResearchFrozenEvidenceV2,
  type ResearchGenerationV2,
} from '@thesis-ledger/schemas';
import type { AiExecutionOwnership } from './ai-execution-state.store.js';
import { AiFrozenResearchError } from './ai-frozen-research.js';
import type { AiRunService } from './ai-run.service.js';
import type { AiResearchSdkExecution } from './ai-research-sdk-execution.js';
import type { ToolPermission } from './contracts.js';
import { buildFrozenResearchMessagesV2 } from './ai-research-messages-v2.js';
import { verifyAiFrozenResearchV2 } from './ai-research-frozen-integrity-v2.js';
import { verifyResearchNumericEvidenceV2 } from './ai-research-numeric-evidence-v2.js';
import { assertResearchRunBindingV2 } from './ai-research-run-binding-v2.js';

type Run = NonNullable<Awaited<ReturnType<AiRunService['claim']>>>;
type Input = {
  run: Run;
  raw: unknown;
  ownership: AiExecutionOwnership;
  runs: AiRunService;
  sdk: AiResearchSdkExecution;
  signal: AbortSignal;
  deadlineAt: number;
  startedAt: number;
};
const permissions: Record<ResearchFrozenEvidenceV2['audit']['kind'], ToolPermission> = {
  quote: 'market:read',
  news: 'news:read',
  reference: 'market:read',
  portfolio: 'portfolio:read',
  risk: 'risk:read',
  strategy: 'strategy:read',
  journal: 'journal:read',
};

async function readFrozenEvidence(input: Input, frozen: AiFrozenResearchV2) {
  const bindings: Array<{ audit: ResearchFrozenEvidenceV2['audit']; toolCallId: string }> = [];
  for (const entry of frozen.evidence) {
    if (!entry.usable) continue;
    if (input.signal.aborted) throw new DOMException('研究任务已取消', 'AbortError');
    if (Date.now() >= input.deadlineAt) throw new Error('冻结材料读取超过研究截止时间');
    const startedAt = Date.now();
    // 这里只读取本次已冻结、已允许的材料；不重取行情或套用当前时点的新鲜度。
    const call = await input.runs.recordToolCall({
      runId: input.run.id,
      tool: `frozenEvidence_${entry.audit.evidenceId.replaceAll('-', '')}`,
      permission: permissions[entry.audit.kind],
      status: 'ok',
      inputSummary: JSON.stringify({
        evidenceId: entry.audit.evidenceId,
        fingerprint: entry.audit.fingerprint,
      }),
      outputSummary: JSON.stringify({
        evidenceId: entry.audit.evidenceId,
        status: entry.status,
        fingerprint: entry.audit.fingerprint,
      }),
      durationMs: Date.now() - startedAt,
      ...(entry.audit.providerId === null ? {} : { provider: entry.audit.providerId }),
      ...(entry.audit.publishedAt === null ? {} : { marketTime: entry.audit.publishedAt }),
      ...(entry.audit.availableAt === null ? {} : { availableAt: entry.audit.availableAt }),
      ...(entry.audit.fetchedAt === null ? {} : { fetchedAt: entry.audit.fetchedAt }),
    });
    if (call.aiRunId !== input.run.id) throw new AiFrozenResearchError('冻结材料审计不属于本任务');
    bindings.push({ audit: entry.audit, toolCallId: call.id });
  }
  return bindings;
}

/** 在现有 SDK、请求事实与租约/结算路径上执行 V2，开关只限制新提交。 */
export async function executeFrozenResearchV2(input: Input) {
  const frozen = verifyAiFrozenResearchV2(input.raw);
  assertResearchRunBindingV2(input.run, frozen);
  const bindings = await readFrozenEvidence(input, frozen);
  const messages = buildFrozenResearchMessagesV2(frozen);
  const buildResult = (raw: ResearchGenerationV2, provider: string, model: string) => {
    const authoritative = verifyAiFrozenResearchV2(frozen);
    const inference = verifyResearchNumericEvidenceV2(authoritative, raw);
    return correlateResearchResultV2(
      authoritative,
      {
        version: 2,
        inputFingerprint: authoritative.inputFingerprint,
        scopeSnapshot: authoritative.scopeSnapshot,
        createdAt: new Date().toISOString(),
        dataCutoffAt: authoritative.dataCutoffAt,
        promptVersion: authoritative.prompt.version,
        model: {
          providerId: provider,
          modelId: model,
          researchSettingsRevision: authoritative.researchSettingsRevision,
        },
        inference,
        evidenceBindings: bindings,
        quality: authoritative.quality,
      },
      bindings.map((binding) => binding.toolCallId),
    );
  };
  await input.sdk.execute({
    ownership: input.ownership,
    run: input.run,
    messages,
    startedAt: input.startedAt,
    signal: input.signal,
    contractVersion: 'research-generation-v2',
    buildResult,
  });
}
