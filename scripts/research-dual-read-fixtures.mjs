import assert from 'node:assert/strict';

export const localResearchOwner = '4cb546a5-b04f-4c0a-9d3b-6a53fdb74f57';
const id = value => `75000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const timestamp = '2026-10-18T09:00:00.000Z';

/** 只构造明确标记的保存产物；调用方只能把它写入固定隔离库。 */
export function buildDualReadFixtures(sample, runtime) {
  const runs = [], calls = [], cases = {};
  function legacy(name, slot, withAudit) {
    const runId = id(slot), callId = id(slot + 100);
    const result = runtime.researchResultSchema.parse({
      version: 1, provider: 'controlled-provider', createdAt: timestamp,
      conclusion: '受控 V1 保存产物：继续观察',
      evidence: [{ claim: '受控历史材料', citations: [{ toolCallId: callId,
        tool: 'portfolioSnapshot', sourceId: 'controlled', provider: 'controlled-ledger',
        observedAt: timestamp }] }],
      risks: [], unknowns: [], disclaimer: '仅供隔离副本读取验收',
    });
    runs.push({ id: runId, provider: 'controlled-provider', model: 'controlled-model',
      promptVersion: 'research-v1', status: 'succeeded', question: '受控 V1 读取验收',
      context: { scope: 'portfolio', mode: 'actual' }, result,
      modelMetadata: { acceptanceFixture: 'controlled-saved-report-v1' } });
    if (withAudit) calls.push({ id: callId, aiRunId: runId, tool: 'portfolioSnapshot',
      permission: 'portfolio:read', status: 'ok', inputSummary: '{}',
      outputSummary: '受控 V1 审计', provider: 'controlled-ledger' });
    cases[name] = { id: runId, referenceId: callId, locator: { view: 'legacy' },
      expected: withAudit ? 'available' : 'pending_verification', result };
  }
  function v2(name, slot, mode, fault) {
    const candidate = structuredClone(sample.frozen);
    candidate.request.submissionId = id(slot + 200);
    candidate.request.mode = mode;
    candidate.scopeSnapshot.mode = mode;
    candidate.evidence[0].numericFields = [{ fieldPath: '/price', unit: 'price', currency: 'CNY' }];
    const frozen = runtime.sealAiFrozenResearchV2(candidate);
    runtime.verifyAiFrozenResearchV2(frozen);
    const callId = id(slot + 100), runId = id(slot);
    const result = runtime.researchResultV2Schema.parse({ ...structuredClone(sample.result),
      inputFingerprint: frozen.inputFingerprint, scopeSnapshot: frozen.scopeSnapshot,
      evidenceBindings: frozen.evidence.map(entry => ({ audit: entry.audit, toolCallId: callId })),
    });
    runtime.verifyResearchNumericEvidenceV2(frozen, result.inference);
    const run = { id: runId, provider: result.model.providerId, model: result.model.modelId,
      promptVersion: frozen.prompt.version, status: 'succeeded', question: frozen.request.question,
      researchOwnerId: localResearchOwner, researchSubmissionId: frozen.request.submissionId,
      researchInputDigest: runtime.researchSubmissionDigestV2(frozen.request),
      researchScopeSnapshot: frozen.scopeSnapshot, result,
      modelMetadata: { acceptanceFixture: 'controlled-saved-report-v1', frozenResearch: frozen } };
    const evidence = frozen.evidence[0];
    calls.push({ id: callId, aiRunId: runId,
      tool: `frozenEvidence_${evidence.audit.evidenceId.replaceAll('-', '')}`,
      permission: 'research:frozen:read', status: 'ok',
      inputSummary: JSON.stringify({ evidenceId: evidence.audit.evidenceId,
        fingerprint: evidence.audit.fingerprint }),
      outputSummary: '受控 V2 冻结材料审计', provider: evidence.audit.providerId });
    if (fault === 'content') frozen.evidence[0].data.price += 1;
    if (fault === 'foreign-call') result.evidenceBindings[0].toolCallId = cases.shadow.toolCallId;
    runs.push(run);
    cases[name] = { id: runId, referenceId: evidence.audit.evidenceId, toolCallId: callId,
      locator: { view: 'scoped', mode, scope: 'instrument', instrumentId: sample.instrumentId },
      expected: fault ? 'invalid' : 'available', result: structuredClone(result) };
  }
  legacy('legacy', 1, true);
  legacy('pending', 2, false);
  v2('shadow', 3, 'shadow');
  v2('actual', 4, 'actual');
  v2('corrupt', 5, 'shadow', 'content');
  v2('foreignCall', 6, 'shadow', 'foreign-call');
  assert.equal(new Set(runs.map(row => row.id)).size, runs.length);
  return { format: 'research-dual-read-fixtures-v1', runs, calls, cases };
}
