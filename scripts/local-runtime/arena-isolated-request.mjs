import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

export async function isolatedRequest(mode, expected, continuation) {
  const { PrismaClient } = await import('@prisma/client');
  const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const read = async () => {
    const db = new PrismaClient();
    try {
      return await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const [row] =
          await tx.$queryRaw`SELECT name,enabled,settings,capabilities,health,priority,"updatedAt"
          FROM "ProviderConfig" WHERE name='lmstudio'`;
        const [cycle] = await tx.$queryRaw`SELECT input,"deadlineAt" FROM "ArenaLiveCycle"
          WHERE id='7e155817-ccfc-45bc-b812-01d9b8906beb'::uuid`;
        const matches =
          await tx.$queryRaw`SELECT to_jsonb(m) AS value FROM "ArenaLiveMatch" m ORDER BY id`;
        const agents =
          await tx.$queryRaw`SELECT to_jsonb(a) AS value FROM "ArenaLiveAgent" a ORDER BY id`;
        const cycles =
          await tx.$queryRaw`SELECT to_jsonb(c) AS value FROM "ArenaLiveCycle" c ORDER BY id`;
        const timelines =
          await tx.$queryRaw`SELECT to_jsonb(t) AS value FROM "ArenaLiveTimeline" t ORDER BY "matchId"`;
        const runs =
          await tx.$queryRaw`SELECT status,count(*)::int AS count FROM "AiRun" GROUP BY status ORDER BY status`;
        const invocation =
          await tx.$queryRaw`SELECT (SELECT count(*)::int FROM "AiInvocation") AS calls,
          (SELECT count(*)::int FROM "AiInvocationFact") AS facts`;
        return {
          row,
          cycle,
          businessSha: sha({ matches, agents, cycles, timelines, runs, invocation }),
        };
      });
    } finally {
      await db.$disconnect();
    }
  };
  const before = await read();
  const { row, cycle } = before;
  assert.equal(row.enabled, true);
  assert.equal(row.settings.authMode, 'none');
  assert.equal(row.settings.baseUrl, 'http://192.168.5.20:6789/v1');
  const binding = cycle.input.protocol.entrants.find((e) => e.providerId === row.name);
  assert(binding);
  assert(row.settings.models.includes(binding.model));
  assert.equal(binding.model, 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m');
  assert.equal(binding.maxInputTokens, null);
  assert.equal(binding.maxOutputTokens, null);
  assert.equal(cycle.deadlineAt, null);
  assert.equal(cycle.input.protocol.resources.maxCycleSeconds, null);
  const { parseAiProviderSettings } = await import('./dist/src/ai/ai-provider-summary.js');
  const { createStoredAiProvider } = await import('./dist/src/ai/ai-provider-runtime.js');
  const { routeSnapshotsFromProviderRow } =
    await import('./dist/src/ai/ai-provider-readiness.persistence.js');
  const { AiProviderRegistry } = await import('./dist/src/ai/provider-registry.js');
  const { aiRouteReasoningFields } = await import('./dist/src/ai/ai-route-reasoning-options.js');
  const { AiSdkGenerationAdapter } = await import('./dist/src/ai/ai-sdk-generation.adapter.js');
  const { prepareModelReceipt } = await import('./dist/src/ai/ai-model-receipt.js');
  const { liveResearchContract } =
    await import('./dist/src/model-arena/live/live-research-contract.js');
  const { buildLiveResearchMessages } =
    await import('./dist/src/model-arena/live/live-research-messages.js');
  const { assertGenerationSchemaPrompt } =
    await import('./dist/src/ai/ai-generation-schema-prompt.js');
  const settings = parseAiProviderSettings(row.settings);
  const provider = await createStoredAiProvider(
    row,
    {
      readCredential: () => {
        throw Error('禁止读取凭证');
      },
    },
    30000,
  );
  const contract = liveResearchContract({ protocol: cycle.input.protocol, replay: true });
  const registry = new AiProviderRegistry();
  registry.replace([provider], routeSnapshotsFromProviderRow(row, settings, row.health));
  const route = registry.strictReadyContract({
    providerId: binding.providerId,
    model: binding.model,
    contract: contract.ref,
    budgetAuthorized: true,
  });
  const runtime = provider.sdkRuntime();
  const messages = buildLiveResearchMessages({ ...cycle.input, replay: true });
  assertGenerationSchemaPrompt(contract.schema, messages);
  const artifacts = Object.fromEntries(
    ['live-research-contract', 'live-research-messages', 'live-research-call'].map((name) => [
      name,
      sha(readFileSync(`./dist/src/model-arena/live/${name}.js`, 'utf8')),
    ]),
  );
  if (continuation) {
    const prior = continuation.prior;
    assert.equal(prior.status, 'passed');
    assert.equal(prior.mode, 'send');
    assert.equal(prior.realModelCalls, 1);
    assert.equal(prior.identity.accepted, true);
    assert.equal(prior.asOf, cycle.input.asOf);
    assert.equal(prior.result.output.action, 'tools');
    assert.equal(
      prior.fingerprint,
      sha({ settings: row.settings, input: cycle.input, messages, artifacts }),
      '原首回复后配置、输入或运行合同发生变化',
    );
    if (mode === 'tools') {
      const bundle = await continuation.collect(cycle.input, prior.result.output.requests);
      const after = await read();
      return {
        status: 'passed',
        mode,
        bundle,
        realModelCalls: 0,
        providerUnchanged: sha(before.row) === sha(after.row),
        businessUnchanged: before.businessSha === after.businessSha,
        businessBefore: before.businessSha,
        businessAfter: after.businessSha,
      };
    }
    assert.deepEqual(
      continuation.bundle.toolResults.map((r) => r.request),
      prior.result.output.requests,
    );
    assert.equal(continuation.bundle.observedAt, cycle.input.asOf);
    messages.push({ role: 'assistant', content: JSON.stringify(prior.result.output) });
    messages.push({ role: 'user', content: JSON.stringify(continuation.bundle) });
  }
  const fingerprint = sha({ settings: row.settings, input: cycle.input, messages, artifacts });
  if (mode === 'send')
    assert.equal(fingerprint, expected, '预检后模型配置或冻结输入变化，禁止出站');
  const requestId = randomUUID(),
    sdk = new AiSdkGenerationAdapter(),
    nativeFetch = globalThis.fetch;
  let dispatches = 0,
    wire;
  const startedAt = new Date().toISOString();
  const proof = mode === 'send' ? await prepareModelReceipt(runtime, binding.model) : null;
  let result, failure;
  try {
    result = await sdk.generate({
      requestId,
      adapter: route.execution.adapter,
      providerId: binding.providerId,
      baseURL: runtime.baseURL,
      apiKey: runtime.apiKey,
      authMode: runtime.authMode ?? 'api_key',
      model: binding.model,
      messages,
      contract: contract.ref,
      schema: contract.schema,
      mode: route.execution.mode,
      transport: 'single',
      ...(route.execution.compatibilityExtensionProfile
        ? { compatibilityExtensionProfile: route.execution.compatibilityExtensionProfile }
        : {}),
      ...aiRouteReasoningFields(route.execution),
      ...(route.execution.requestOptions ? { requestOptions: route.execution.requestOptions } : {}),
      timeout: {},
      signal: new AbortController().signal,
      httpClient: async (url, init) => {
        assert.equal(dispatches, 0, '单次授权已用尽，禁止第二次派发');
        const target = new URL(url);
        assert.equal(target.href, 'http://192.168.5.20:6789/v1/chat/completions');
        assert.equal(init.method, 'POST');
        const body = JSON.parse(init.body);
        assert.equal(body.model, binding.model);
        assert.notEqual(body.stream, true); // 兼容 SDK 通过省略 stream 表示单次响应。
        assert(
          !['max_tokens', 'max_completion_tokens', 'max_output_tokens'].some((k) =>
            Object.hasOwn(body, k),
          ),
        );
        wire = {
          sha: sha(body),
          model: body.model,
          fields: Object.keys(body),
          parameters: Object.fromEntries(
            Object.entries(body).filter(([k]) => !['messages', 'response_format'].includes(k)),
          ),
          schemaSha: sha(body.response_format),
          messagesSha: sha(body.messages),
        };
        dispatches++;
        if (mode === 'send') return nativeFetch(url, { ...init, redirect: 'error' });
        return new Response(
          JSON.stringify({
            id: 'offline',
            object: 'chat.completion',
            created: 0,
            model: binding.model,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: JSON.stringify({
                    action: 'tools',
                    requests: [{ name: 'quote', symbol: '588000.SH' }],
                  }),
                },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });
  } catch (error) {
    failure = {
      code: error.fact?.code ?? 'request_failed',
      fact: error.fact ?? null,
      usage: error.usage ?? null,
      completion: error.completion ?? null,
      message: error.message.slice(0, 500),
    };
  }
  const identity = result && proof ? await proof.verify(result.actualModel) : null;
  let validation;
  if (mode === 'send' && continuation && !failure && identity?.accepted) {
    try {
      assert.equal(result.output.action, 'decision', '模型仍要求工具；本轮停止，不追加生成');
      validation = await continuation.validate(cycle.input, result.output.decision);
    } catch (error) {
      validation = { status: 'failed', reason: error.message.slice(0, 500) };
    }
  }
  const after = await read();
  const passed =
    !failure &&
    (mode !== 'send' || identity?.accepted === true) &&
    (!validation || validation.status === 'passed') &&
    sha(before.row) === sha(after.row) &&
    before.businessSha === after.businessSha;
  return {
    status: passed ? 'passed' : 'failed',
    mode,
    fingerprint,
    requestId,
    startedAt,
    completedAt: new Date().toISOString(),
    realModelCalls: mode === 'send' ? dispatches : 0,
    transportCalls: dispatches,
    automaticRetries: 0,
    asOf: cycle.input.asOf,
    binding,
    execution: route.execution,
    wire,
    result,
    failure,
    identity,
    validation,
    providerUnchanged: sha(before.row) === sha(after.row),
    businessUnchanged: before.businessSha === after.businessSha,
    businessBefore: before.businessSha,
    businessAfter: after.businessSha,
  };
}
