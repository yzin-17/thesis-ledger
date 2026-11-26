import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const matchId = '6f41c462-176a-4d6f-957e-331015e2af0f';
const pairs = [
  ['6c066acb-a259-4499-ac44-05fdae74517e', 'dc4a5e96-537d-4e62-ac1d-8941dd14a8af'],
  ['53368c38-2223-4e6f-963f-70b3bbccac6e', 'd799edb9-545b-4c5a-9d6b-c356207364f7'],
  ['991757ff-169f-4f4f-bf0b-771f5af9c3cc', 'ac21bfbe-140d-429e-95c6-7adf56157b78'],
  ['72df5e24-e09a-4a7d-b14f-a5e46c5f803f', 'bc1d15d7-976d-420c-935a-f6d77f162db1'],
];
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = (value) => structuredClone(value);
const modes = ['native_schema', 'json_validated', 'json_mode'];

function schemaText(system) {
  const index = system.indexOf('OUTPUT_JSON_SCHEMA:');
  assert(index >= 0, '缺少冻结 Schema');
  return JSON.parse(system.slice(index + 'OUTPUT_JSON_SCHEMA:'.length));
}

function changedPaths(left, right, path = '') {
  if (JSON.stringify(left) === JSON.stringify(right)) return [];
  if (
    !left ||
    !right ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) ||
    Array.isArray(right)
  )
    return [path];
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap((key) =>
    changedPaths(left[key], right[key], path ? `${path}.${key}` : key),
  );
}

async function readHistory() {
  const { PrismaClient } = await import('@prisma/client');
  const historyDb = new PrismaClient();
  try {
    return await historyDb.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return tx.$queryRaw`SELECT id,state,reason,input,"requestAudit" FROM "ArenaLiveCycle"
        WHERE "matchId"=${matchId}::uuid ORDER BY "createdAt",id`;
    });
  } finally {
    await historyDb.$disconnect();
  }
}

function frozenMessages(cycle, build) {
  const input = cycle.input;
  return build({ ...input, replay: input.replay === true });
}

function scopedProjection(oldMessages, current, contract, prompt) {
  const messages = clone(oldMessages),
    originalUser = JSON.parse(messages[1].content);
  const marker = messages[0].content.indexOf('OUTPUT_JSON_SCHEMA:');
  const system = current[0].content;
  const start = system.indexOf('每次回复只选择一个action。');
  const end = system.indexOf('每次决策必须预约', start);
  assert(start >= 0 && end > start, '部署提示缺少等待边界');
  // 有意保留旧业务提示，只投影本次能力、Schema 和等待语义，另测真实当前构造器。
  const prefix = messages[0].content.slice(0, marker);
  messages[0].content = `${prefix}${system.slice(start, end)}\n${prompt(contract.schema)}`;
  messages[1].content = JSON.stringify({ ...originalUser, capabilities: contract.capabilities });
  assert(messages[0].content.startsWith(prefix));
  const withoutCapabilities = JSON.parse(messages[1].content);
  delete withoutCapabilities.capabilities;
  assert.deepEqual(withoutCapabilities, originalUser);
  return messages;
}

async function sdkChecks(sdk, contract, messages, output, finishReason, expected, counters) {
  for (const mode of modes) {
    let intercepted = 0;
    const request = {
      requestId: randomUUID(),
      adapter: 'openai-compatible-chat',
      providerId: 'offline',
      baseURL: 'https://offline.invalid/v1',
      apiKey: '',
      authMode: 'none',
      model: 'fixed-reply',
      messages,
      contract: contract.ref,
      schema: contract.schema,
      mode,
      transport: 'single',
      timeout: {},
      signal: new AbortController().signal,
      httpClient: async (url, init) => {
        assert.equal(new URL(url).hostname, 'offline.invalid');
        intercepted++;
        counters.fixedResponses++;
        const body = JSON.parse(init.body);
        assert.deepEqual(body.messages, messages, '实际发送的冻结上下文必须保留');
        assert(!Object.hasOwn(body, 'tools') && !Object.hasOwn(body, 'tool_choice'));
        assert(!Object.hasOwn(body, 'stop'));
        if (mode === 'native_schema') {
          const actual = clone(body.response_format.json_schema.schema);
          const projected = schemaText(messages[0].content);
          delete actual.$schema;
          delete projected.$schema;
          assert.deepEqual(actual, projected);
        }
        return new Response(
          JSON.stringify({
            id: 'fixed-reply',
            object: 'chat.completion',
            created: 0,
            model: 'fixed-reply',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: output },
                finish_reason: finishReason,
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    };
    let result, error;
    try {
      result = await sdk.generate(request);
    } catch (caught) {
      error = caught;
    }
    assert.equal(intercepted, 1, '固定响应不应自动重试');
    if (expected === 'accepted') {
      assert.equal(error?.fact?.code ?? null, null, `${mode} 固定合法回复应通过`);
      assert.deepEqual(result.output, contract.schema.parse(JSON.parse(output)));
    } else {
      assert(error, '应拒绝该固定响应');
      assert.equal(error.fact.code, expected);
    }
    counters[expected]++;
  }
}

async function waitBoundary(cycle, first, nextDecision, outcome, Runner, counters) {
  let release, started;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const calls = [],
    submitted = [],
    failures = [],
    events = [];
  const memoryCycle = { ...clone(cycle), state: 'running', attempt: 1, deadlineAt: null };
  // Runner 及租约控制仅持有这个内存替身；真实只读客户端已断开。
  const memoryDb = {
    $queryRaw: async (sql) => {
      const text = sql.join('?');
      if (text.includes('UPDATE')) {
        events.push('memory_lease');
        return [{ id: cycle.id }];
      }
      assert(text.includes('SELECT'));
      return [memoryCycle];
    },
  };
  const call = {
    generate: async (_id, _attempt, messages) => {
      calls.push(clone(messages));
      assert(calls.length <= 2, '只允许固定的两步研究');
      return calls.length === 1 ? clone(first) : clone(nextDecision);
    },
  };
  const tools = {
    execute: async (_protocol, request, _signal, asOf) => {
      assert.equal(asOf, cycle.input.asOf);
      started();
      await gate;
      counters.toolMocks++;
      if (outcome.status === 'unavailable') throw new Error('离线受控资料不可用');
      const result = outcome.results.find(
        (item) => JSON.stringify(item.request) === JSON.stringify(request),
      );
      assert(result, '没有对应的历史工具结果');
      assert.equal(result.outcome.status, 'ready');
      return clone(result.outcome.data);
    },
  };
  const budget = Object.fromEntries(
    ['reserve', 'settle', 'tool'].map((name) => [
      name,
      async () => {
        events.push(name);
      },
    ]),
  );
  budget.fail = async (_id, _attempt, reason) => {
    failures.push(reason);
  };
  const orders = {
    submit: async (_id, _attempt, value) => {
      submitted.push(clone(value));
    },
  };
  const runner = new Runner(memoryDb, call, tools, budget, orders);
  const running = runner.execute(cycle.id, 1);
  try {
    await Promise.race([
      entered,
      running.then(() => {
        throw new Error('尚未等待工具就已结束');
      }),
    ]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(submitted.length, 0);
    assert(!events.includes('settle'));
  } finally {
    release();
  }
  await running;
  assert.deepEqual(failures, []);
  assert.equal(calls.length, 2);
  assert.deepEqual(submitted, [nextDecision.decision]);
  const feedback = JSON.parse(calls[1].at(-1).content);
  assert.equal(feedback.observedAt, cycle.input.asOf);
  assert.deepEqual(JSON.parse(calls[1].at(-2).content), first);
  assert.deepEqual(
    feedback.toolResults.map((r) => r.request),
    first.requests,
  );
  assert(feedback.toolResults.every((r) => r.outcome.status === outcome.status));
  if (outcome.status === 'ready') assert.deepEqual(feedback.toolResults, outcome.results);
  counters.waitCases++;
}

async function rejectedBoundary(cycle, output, Runner, counters) {
  let generated = 0,
    failed = 0,
    effects = 0;
  const memory = { ...clone(cycle), state: 'running', attempt: 1, deadlineAt: null };
  const memoryDb = {
    $queryRaw: async (sql) => (sql.join('?').includes('UPDATE') ? [{ id: cycle.id }] : [memory]),
  };
  const forbidden = async () => {
    effects++;
    throw new Error('越界回复不允许副作用');
  };
  const runner = new Runner(
    memoryDb,
    {
      generate: async () => {
        generated++;
        return clone(output);
      },
    },
    { execute: forbidden },
    {
      reserve: forbidden,
      settle: forbidden,
      tool: forbidden,
      fail: async () => {
        failed++;
      },
    },
    { submit: forbidden },
  );
  await runner.execute(cycle.id, 1);
  assert.equal(generated, 1);
  assert.equal(failed, 1);
  assert.equal(effects, 0);
  counters.rejectedBeforeEffects++;
}

export async function runOfflineReplay() {
  const rows = await readHistory(),
    original = sha(rows);
  let networkAttempts = 0;
  globalThis.fetch = () => {
    networkAttempts++;
    throw new Error('OFFLINE_NETWORK_FORBIDDEN');
  };
  const { liveResearchContract } =
    await import('./dist/src/model-arena/live/live-research-contract.js');
  const { buildLiveResearchMessages } =
    await import('./dist/src/model-arena/live/live-research-messages.js');
  const { buildGenerationSchemaPrompt } =
    await import('./dist/src/ai/ai-generation-schema-prompt.js');
  const { aiGenerationContracts } = await import('@thesis-ledger/schemas');
  const { AiSdkGenerationAdapter } = await import('./dist/src/ai/ai-sdk-generation.adapter.js');
  const { LiveResearchRunner } =
    await import('./dist/src/model-arena/live/live-research-runner.js');
  const sdk = new AiSdkGenerationAdapter();
  const calls = rows.flatMap((cycle) =>
    (cycle.requestAudit?.calls ?? [])
      .filter((call) => call.input?.messages)
      .map((call) => ({ cycle, call })),
  );
  const byRequest = new Map(calls.map((item) => [item.call.requestId, item]));
  const counters = {
    fixedResponses: 0,
    accepted: 0,
    schema_invalid: 0,
    output_truncated: 0,
    toolMocks: 0,
    waitCases: 0,
    rejectedBeforeEffects: 0,
  };
  const corpus = {
    outputs: 0,
    broadAccepted: 0,
    scopedAccepted: 0,
    decisions: 0,
    rejectedBatches: 0,
    rejectedDailyRequests: 0,
  };
  const rejected = [];
  for (const { cycle, call } of calls) {
    if (!call.output) continue;
    corpus.outputs++;
    assert(aiGenerationContracts.arenaLiveResearch.schema.safeParse(call.output).success);
    corpus.broadAccepted++;
    const c = liveResearchContract({
      protocol: cycle.input.protocol,
      replay: cycle.input.replay === true,
    });
    if (c.schema.safeParse(call.output).success) {
      corpus.scopedAccepted++;
      if (call.output.action === 'decision') corpus.decisions++;
    } else {
      assert.equal(call.output.action, 'tools');
      const daily = call.output.requests.filter((r) => r.timeframe === '1d');
      assert(daily.length > 0);
      for (const r of call.output.requests.filter((r) => r.timeframe !== '1d'))
        assert(c.schema.safeParse({ action: 'tools', requests: [r] }).success);
      corpus.rejectedBatches++;
      corpus.rejectedDailyRequests += daily.length;
      rejected.push({ requestId: call.requestId, dailyRequests: daily.length });
      await sdkChecks(
        sdk,
        c,
        frozenMessages(cycle, buildLiveResearchMessages),
        JSON.stringify(call.output),
        'stop',
        'schema_invalid',
        counters,
      );
      await rejectedBoundary(cycle, call.output, LiveResearchRunner, counters);
    }
  }
  const comparisons = [],
    waitSkipped = [];
  for (const [failedId, successId] of pairs) {
    const failed = byRequest.get(failedId),
      success = byRequest.get(successId);
    assert(failed && success);
    assert.equal(failed.call.error.code, 'output_truncated');
    assert.equal(failed.call.error.diagnostic.finishReason, 'length');
    assert.equal(failed.call.output, undefined, '旧截断没有正文，不伪造原文');
    assert.equal(failed.cycle.input.asOf, success.cycle.input.asOf);
    const oldUsers = [failed, success].map((x) => JSON.parse(x.call.input.messages[1].content));
    for (const user of oldUsers) assert.deepEqual(user.protocol, failed.cycle.input.protocol);
    for (const item of [failed, success]) {
      const c = liveResearchContract({
        protocol: item.cycle.input.protocol,
        replay: item.cycle.input.replay === true,
      });
      const current = frozenMessages(item.cycle, buildLiveResearchMessages);
      const projected = scopedProjection(
        item.call.input.messages,
        current,
        c,
        buildGenerationSchemaPrompt,
      );
      assert.deepEqual(schemaText(current[0].content), schemaText(projected[0].content));
      const fixed = JSON.stringify(success.call.output);
      const expected = c.schema.safeParse(success.call.output).success
        ? 'accepted'
        : 'schema_invalid';
      await sdkChecks(sdk, c, current, fixed, 'stop', expected, counters);
      await sdkChecks(sdk, c, projected, fixed, 'stop', expected, counters);
      if (item === failed) {
        await sdkChecks(sdk, c, current, '', 'length', 'output_truncated', counters);
        const valid = JSON.stringify({
          action: 'tools',
          requests: [{ name: 'quote', symbol: '588000.SH' }],
        });
        await sdkChecks(sdk, c, current, valid, 'length', 'output_truncated', counters);
      }
    }
    comparisons.push({
      failed: failedId,
      normal: successId,
      asOf: failed.cycle.input.asOf,
      normalCycleState: success.cycle.state,
      normalAction: success.call.output.action,
      normalScopedAccepted: liveResearchContract({
        protocol: success.cycle.input.protocol,
        replay: success.cycle.input.replay === true,
      }).schema.safeParse(success.call.output).success,
      oldUserDifferences: changedPaths(...oldUsers),
      frozenInputSha: sha(failed.cycle.input),
      originalMessagesSha: sha(failed.call.input.messages),
      historicalContract: failed.call.input.contract,
      currentContract: aiGenerationContracts.arenaLiveResearch.ref,
      oldSchemaCharacters: JSON.stringify(schemaText(failed.call.input.messages[0].content)).length,
      currentBroadSchemaCharacters: JSON.stringify(
        schemaText(buildGenerationSchemaPrompt(aiGenerationContracts.arenaLiveResearch.schema)),
      ).length,
      scopedSchemaCharacters: JSON.stringify(
        schemaText(frozenMessages(failed.cycle, buildLiveResearchMessages)[0].content),
      ).length,
    });
    if (success.cycle.state !== 'succeeded') continue;
    const cycleCalls = calls.filter((x) => x.cycle.id === success.cycle.id).map((x) => x.call);
    const decision = cycleCalls.findLast((x) => x.output?.action === 'decision')?.output;
    const scoped = liveResearchContract({ protocol: success.cycle.input.protocol, replay: true });
    const toolIndex = cycleCalls.findIndex(
      (x) => x.output?.action === 'tools' && scoped.schema.safeParse(x.output).success,
    );
    if (toolIndex < 0) {
      waitSkipped.push({
        requestId: successId,
        reason: '该周期只有包含日线的工具批次，已验证其提前拒绝，不修改历史输出构造成功路径',
      });
      continue;
    }
    const firstTool = cycleCalls[toolIndex].output;
    const results = cycleCalls[toolIndex + 1]?.input.messages
      .filter((m) => m.role === 'user')
      .map((m) => JSON.parse(m.content))
      .at(-1)?.toolResults;
    assert(decision && results);
    assert.deepEqual(
      results.map((r) => r.request),
      firstTool.requests,
    );
    for (const status of ['ready', 'unavailable'])
      await waitBoundary(
        success.cycle,
        firstTool,
        decision,
        { status, results },
        LiveResearchRunner,
        counters,
      );
  }
  assert.equal(networkAttempts, 0);
  assert.equal(sha(rows), original);
  const artifacts = Object.fromEntries(
    [
      'live-research-contract',
      'live-research-messages',
      'live-research-call',
      'live-research-runner',
    ].map((n) => [
      n,
      createHash('sha256')
        .update(readFileSync(`./dist/src/model-arena/live/${n}.js`))
        .digest('hex'),
    ]),
  );
  return {
    status: 'passed',
    cycles: rows.length,
    historicalModelCalls: calls.length,
    corpus,
    comparisons,
    rejected,
    waitSkipped,
    ...counters,
    realModelCalls: 0,
    networkAttempts,
    frozenRecordsUnchanged: true,
    artifacts,
  };
}
