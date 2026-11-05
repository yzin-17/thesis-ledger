/** 复用正式复盘纯函数构造保存样本；所有账本材料均来自既有合成夹具。 */
export function buildConsumerFixtures(input, runtime, accountId, v1Result, v2Result) {
  const evidence = structuredClone(input);
  evidence.trade.accountId = accountId;
  const candidate = runtime.journalReviewCandidate({ evidence, fxMissing: false, projectionStale: false });
  const facts = runtime.journalReviewObjectFacts(candidate.input);
  const single = runtime.journalAiFrozenEvidenceSchema.parse({
    version: 'journal-review-ai-v1', accountId, mode: 'actual',
    reviewObjectId: candidate.input.reference.reviewObjectId,
    evidenceFingerprint: candidate.input.projection.evidenceFingerprint,
    analysisDraft: candidate.input.analysisDraft, facts,
    result: runtime.journalAnalyzeCandidate(candidate),
  });
  const window = { accountId, mode: 'actual', start: '2026-01-01T00:00:00Z', end: '2026-01-04T00:00:00Z' };
  const periodResult = runtime.journalAnalyzePeriod([candidate], window);
  const period = runtime.journalPeriodAiFrozenEvidenceSchema.parse({
    version: 'journal-period-ai-v1',
    request: { ...window, expectedLedgerRevision: candidate.input.projection.ledgerRevision,
      expectedProjectionGeneration: candidate.input.projection.projectionGeneration,
      expectedAlgorithmVersion: periodResult.algorithmVersion,
      objectFingerprints: { [candidate.input.reference.reviewObjectId]: candidate.input.projection.evidenceFingerprint } },
    facts: [facts], result: periodResult,
  });
  const runs = [], calls = [], cases = {};
  for (const [index, kind] of ['single', 'period'].entries()) {
    const data = kind === 'single' ? single : period;
    const prompt = kind === 'single' ? runtime.journalReviewPrompt : runtime.journalPeriodReviewPrompt;
    const tool = kind === 'single' ? 'getJournalReview' : 'getJournalPeriodReview';
    for (const version of [1, 2]) {
      const number = 10 + index * 2 + version;
      const id = `75000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
      const callId = `75000000-0000-4000-8000-${String(300 + number).padStart(12, '0')}`;
      const result = structuredClone(version === 1 ? v1Result : v2Result);
      if (version === 1) result.evidence[0].citations[0] = {
        toolCallId: callId, tool, sourceId: `controlled-journal-${kind}`, provider: 'thesis-ledger',
        observedAt: '2026-10-18T09:00:00.000Z',
      };
      const frozen = runtime.aiFrozenResearchSchema.parse({ version: 'frozen-research-v1', prompt,
        source: { tool, permission: 'journal:read', evidence: { sourceId: `controlled-journal-${kind}`,
          provider: 'thesis-ledger', fetchedAt: '2026-10-18T09:00:00.000Z', data } } });
      runs.push({ id, provider: 'controlled-provider', model: 'controlled-model', promptVersion: prompt.version,
        status: 'succeeded', question: `受控 ${kind} 复盘读取验收`, context: { scope: 'account', accountId },
        result, modelMetadata: { acceptanceFixture: 'controlled-saved-journal-v1', frozenResearch: frozen } });
      calls.push({ id: callId, aiRunId: id, tool, permission: 'journal:read', status: 'ok',
        inputSummary: '{}', outputSummary: '受控复盘保存审计', provider: 'thesis-ledger' });
      cases[`${kind}V${version}`] = { id, kind, version, accountId, mode: 'actual', result: version === 1 ? result : null };
    }
  }
  const account = { id: accountId, name: '受控双读复盘账户', type: 'securities', mode: 'actual',
    currency: 'USD', active: true, updatedAt: '2026-10-18T09:00:00.000Z' };
  return { format: 'research-dual-read-fixtures-v1', account, runs, calls, cases };
}
