export async function checkArenaV6(sample) {
  const { arenaLiveAccountSchema, arenaLiveProtocolSchema } = await import('@thesis-ledger/schemas');
  const { arenaDateAt, arenaSellAvailability, ArenaSellAvailabilityError, arenaSubmitDecision } = await import('@thesis-ledger/domain');
  const { AiSdkGenerationAdapter } = await import('./dist/src/ai/ai-sdk-generation.adapter.js');
  const { liveResearchContract } = await import('./dist/src/model-arena/live/live-research-contract.js');
  const { buildLiveResearchMessages } = await import('./dist/src/model-arena/live/live-research-messages.js');
  const { invalidDecisionForCorrection } = await import('./dist/src/model-arena/live/live-invalid-decision.js');
  const { liveCallFailureDiagnostics } = await import('./dist/src/model-arena/live/live-call-diagnostics.js');
  const { liveDecisionFeedback } = await import('./dist/src/model-arena/live/live-decision-feedback.js');
  const { LiveResearchRunner } = await import('./dist/src/model-arena/live/live-research-runner.js');
  const { planFailedResearchWakeup } = await import('./dist/src/model-arena/live/live-research-wakeup-recovery.js');
  const protocol = arenaLiveProtocolSchema.parse(sample.protocol);
  const account = arenaLiveAccountSchema.parse({ ...sample.account,
    fills: sample.account.fills.map(fill => ({ ...fill, evidence: { offline: true } })) });
  const original = JSON.stringify(account), contract = liveResearchContract({ protocol, replay: true });
  assert.equal(contract.ref.version, 'arena-live-research-v6');
  const messages = buildLiveResearchMessages({ protocol, account, asOf: sample.asOf, replay: true });
  assert.equal(JSON.parse(messages[1].content).sellAvailability[0].availableQuantity, '0');
  assert.equal(arenaDateAt(sample.asOf, protocol.timeZone), '2026-11-02');
  const native = globalThis.fetch;
  let networkAttempts = 0, fixedResponses = 0, invalid;
  globalThis.fetch = async () => { networkAttempts++; throw new Error('禁止真实网络'); };
  try {
    for (const mode of ['native_schema', 'json_validated', 'json_mode']) for (const finish of ['stop', 'length']) {
      let error;
      try {
        await new AiSdkGenerationAdapter().generate({ requestId: sample.requestId, adapter: 'openai-compatible-chat',
          providerId: 'offline', baseURL: 'https://offline.invalid/v1', apiKey: '', authMode: 'none', model: 'fixed',
          messages, contract: contract.ref, schema: contract.schema, mode, transport: 'single', timeout: {},
          signal: new AbortController().signal, httpClient: async () => {
            fixedResponses++;
            return new Response(JSON.stringify({ id: 'fixed', object: 'chat.completion', created: 0, model: 'fixed',
              choices: [{ index: 0, message: { role: 'assistant', content: sample.outputText }, finish_reason: finish }],
              usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }),
              { status: 200, headers: { 'Content-Type': 'application/json' } });
          } });
      } catch (caught) { error = caught; }
      assert.equal(error?.fact?.code, finish === 'length' ? 'output_truncated' : 'schema_invalid');
      const candidate = invalidDecisionForCorrection(error.fact, liveCallFailureDiagnostics(error, contract.schema, ''), contract.schema);
      if (finish === 'length') assert.equal(candidate, null);
      else {
        assert(candidate); assert.equal(candidate.reply, sample.outputText);
        assert.equal(liveDecisionFeedback(candidate, sample.asOf).decisionRejected.issues.length, 3);
        invalid = candidate;
      }
    }
    const corrected = JSON.parse(sample.outputText);
    corrected.decision.orders[0].onFill = null; corrected.decision.orders[0].expiresOn = null;
    corrected.decision.cancelOrderIds = account.orders.filter(o => o.side === 'sell' && o.state === 'active').map(o => o.id);
    assert(contract.schema.safeParse(corrected).success);
    const context = { at: sample.asOf, tradingDate: '2026-11-02', maxPositionBps: protocol.maxPositionBps,
      maxActiveSymbols: protocol.resources.maxActiveSymbols, allowedSymbols: new Set(['510300.SH']), fees: protocol.fees,
      expiresAt: () => '2026-11-02T03:30:00Z', newId: () => crypto.randomUUID(), quotes: [{ symbol: '510300.SH', price: '4.091',
        marketTime: sample.asOf, observedAt: sample.asOf, sourceRef: 'offline', evidence: {}, tradingDate: '2026-11-02',
        positionAvailableOn: '2026-11-03', cashAvailableOn: '2026-11-02', lot: '100', tick: '0.001',
        buyBlocked: null, sellBlocked: null, statutoryBuyFee: () => '0', statutorySellFee: () => '0' }] };
    let rejected;
    try { arenaSubmitDecision(account, account.revision, corrected.decision, context); } catch (caught) { rejected = caught; }
    assert(rejected instanceof ArenaSellAvailabilityError);
    const feedback = liveDecisionFeedback(rejected, sample.asOf);
    assert.equal(feedback.decisionRejected.reason, 'position_not_settled');
    assert.equal(feedback.decisionRejected.sellAvailability.availableQuantity, '0');
    assert.equal(arenaSellAvailability(account, '510300.SH', '2026-11-03').unsettledQuantity, '0');
    const watch = { action: 'decision', decision: { ...corrected.decision, orders: [], cancelOrderIds: [], summary: '保留持仓并等待可卖日' } };
    const memoryResults = [];
    for (const second of [watch, corrected]) {
      let calls = 0, submitted = 0, failure = null;
      const cycle = { state: 'running', attempt: 1, deadlineAt: null, input: { protocol, account, asOf: sample.asOf, replay: true } };
      const db = { $queryRaw: async sql => sql.join('').includes('SELECT *') ? [cycle] : [{ id: 'memory' }] };
      const runner = new LiveResearchRunner(db, { generate: async () => {
        calls++; assert(calls <= 2); if (calls === 1) throw invalid; return second;
      } }, { execute: async () => { throw new Error('禁止来源读取'); } }, {
        fail: async (_id, _attempt, reason) => { failure = reason; },
      }, { submit: async (_id, _attempt, decision) => { arenaSubmitDecision(account, account.revision, decision, context); submitted++; } });
      await runner.execute('memory', 1);
      assert.equal(calls, 2);
      assert.equal(submitted, second === watch ? 1 : 0);
      assert.equal(failure, second === watch ? null : 'insufficient_position');
      memoryResults.push({ calls, submitted, failure });
    }
    const stopped = await planFailedResearchWakeup({ $queryRaw: async () => { throw new Error('截断不应安排后续研究'); } },
      { state: 'running' }, {}, 'memory', { calls: [{ error: { code: 'output_truncated' } }] }, new Date());
    assert.equal(stopped.canContinue, false); assert.equal(stopped.account, null);
    assert.equal(JSON.stringify(account), original); assert.equal(networkAttempts, 0); assert.equal(fixedResponses, 6);
    return { status: 'passed', fixedResponses, memoryResults, networkAttempts, realModelCalls: 0,
      accountUnchanged: true, contract: contract.ref, truncationStopped: true };
  } finally { globalThis.fetch = native; }
}
