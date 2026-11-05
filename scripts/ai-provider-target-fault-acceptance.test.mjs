import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import {
  createTargetFaultRelay,
  targetFaultFrames,
  assertTargetFaultModelRequest,
} from './ai-provider-target-fault-relay.mjs';
import {
  runTargetFaultAcceptance,
  targetFaultOptions,
} from './ai-provider-target-fault-acceptance.mjs';
import { targetFaultModel, targetFaultDraft } from './ai-provider-target-fault-requests.mjs';

const body = {
  model: targetFaultModel,
  stream: true,
  response_format: { type: 'json_object' },
  chat_template_kwargs: { enable_thinking: false },
};
const frame = (content, extra = {}) =>
  `data: ${JSON.stringify({ model: targetFaultModel, choices: [{ delta: { content }, finish_reason: null }], ...extra })}\n\n`;
const raw = Buffer.from(
  frame('{"message":"') +
    Array.from({ length: 40 }, (_, i) => frame(String(i % 10))).join('') +
    frame('"}') +
    `data: ${JSON.stringify({ model: targetFaultModel, choices: [], usage: { prompt_tokens: 3, completion_tokens: 43 } })}\n\ndata: [DONE]\n\n`,
);

test('默认计划零Docker、凭据与外部调用，各场景次数固定', async () => {
  assert.deepEqual(await runTargetFaultAcceptance(targetFaultOptions([])), {
    mode: 'plan',
    scenario: 'guard',
    realModelCallLimit: 0,
    feeCeiling: '0 USD',
    dockerMutations: 0,
    credentialReads: 0,
    externalCalls: 0,
  });
  assert.equal(
    (await runTargetFaultAcceptance(targetFaultOptions(['--case', 'deadline']))).realModelCallLimit,
    2,
  );
});

test('未知场景、额外参数或没有明确授权输出时在Docker之前拒绝', () => {
  for (const args of [
    ['--case', 'other'],
    ['--execute'],
    ['--case'],
    ['--retry'],
    ['--output', '--execute'],
  ])
    assert.throws(() => targetFaultOptions(args));
});

test('模型路径、JSON方式、关闭思考及单次限制严格拒绝反例', () => {
  assertTargetFaultModelRequest('/v1/chat/completions', body, 0, 1);
  for (const [path, candidate, used] of [
    ['/v1/responses', body, 0],
    ['/v1/chat/completions', { ...body, model: 'other' }, 0],
    ['/v1/chat/completions', { ...body, stream: false }, 0],
    ['/v1/chat/completions', body, 1],
  ])
    assert.throws(() => assertTargetFaultModelRequest(path, candidate, used, 1));
});

test('保留真实SSE内容前缀，完整JSON及终止帧不会被选为故障交付', () => {
  const parsed = targetFaultFrames(raw);
  assert.equal(parsed.safe.length, 41);
  assert.equal(parsed.model, targetFaultModel);
  assert.equal(parsed.usage.prompt_tokens, 3);
  assert(parsed.safe.every((bytes) => raw.includes(bytes)));
  const text = parsed.safe
    .map((bytes) => JSON.parse(bytes.toString().slice(6).trim()).choices[0].delta.content)
    .join('');
  assert.throws(() => JSON.parse(text));
  assert(!Buffer.concat(parsed.safe).includes(Buffer.from('[DONE]')));
  assert.throws(() => targetFaultFrames(Buffer.from(frame('{"ok":true}'))));
});

test('内容中的空白帧与下一段正文一并保留，故障前缀不改写原文', () => {
  const prefix = frame('{"note":"a') + frame(' ') + frame('b');
  const parsed = targetFaultFrames(Buffer.from(prefix + frame('"}')));
  assert.equal(Buffer.concat(parsed.safe).toString(), prefix);
  assert.equal(parsed.safe.length, 2);
});

test('草稿不修改原模型价格，临时零费率及原凭据仅作为入参', () => {
  const row = {
    priority: 1,
    updatedAt: new Date(),
    settings: {
      authMode: 'api_key',
      upstreamFormat: 'chat-completions',
      chatImplementation: 'compatible',
      models: [targetFaultModel],
      modelPricing: {
        [targetFaultModel]: {
          costPer1kInput: 1,
          costPer1kOutput: 2,
          costCurrency: 'USD',
          pricingVersion: 'historical-version',
          source: 'user',
        },
      },
    },
  };
  const candidate = targetFaultDraft(row, 'http://127.0.0.1:1/v1', 'synthetic-key', true);
  assert.equal(candidate.modelPricing[targetFaultModel].costPer1kInput, 0);
  assert.equal(row.settings.modelPricing[targetFaultModel].costPer1kInput, 1);
  assert.equal(candidate.expectedRevision, row.updatedAt.toISOString());
  assert.equal(candidate.executionRoutes.length, 2);
  const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
  const { assertModelRequestOptions } = require('./dist/src/ai/ai-model-request-options.js');
  const { runtimeAdapterForSelection } = require('./dist/src/ai/ai-provider-upstream.js');
  const adapter = runtimeAdapterForSelection({
    upstreamFormat: 'chat-completions',
    chatImplementation: 'compatible',
  });
  assert.doesNotThrow(() => assertModelRequestOptions(candidate, adapter));
  assert.doesNotThrow(() =>
    assertModelRequestOptions(
      targetFaultDraft(row, 'http://127.0.0.1:1/v1', 'synthetic-key', false),
      adapter,
    ),
  );
  const {
    aiProviderInputSchema,
    aiProviderTestInputSchema,
  } = require('./dist/src/ai/ai-provider.contracts.js');
  assert.doesNotThrow(() => aiProviderInputSchema.parse(candidate));
  assert.doesNotThrow(() =>
    aiProviderTestInputSchema.parse({
      ...candidate,
      model: targetFaultModel,
      testKind: 'generation',
      mode: 'json_mode',
      budgetAuthorized: false,
    }),
  );
});

async function localRelay(scenario, execute) {
  let upstreamRequests = 0;
  const upstream = createServer((_request, response) => {
    upstreamRequests += 1;
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(raw);
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const relay = await createTargetFaultRelay({
    scenario,
    upstreamBase: `http://127.0.0.1:${upstream.address().port}/v1`,
    limit: scenario === 'deadline' ? 2 : 1,
    live: false,
    intervalMs: 2,
  });
  try {
    await execute(relay, () => upstreamRequests);
  } finally {
    await relay.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
}

const post = (relay, signal) =>
  fetch(`${relay.origin}/chat/completions`, { method: 'POST', body: JSON.stringify(body), signal });
const waitEvent = async (relay, kind, requestIndex) => {
  const until = Date.now() + 2000;
  while (
    !relay.events.some(
      (event) =>
        event.kind === kind && (requestIndex === undefined || event.requestIndex === requestIndex),
    )
  ) {
    assert(Date.now() < until, '未收到所属事件');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

test('空正文样本实际读完上游但不交付，调用方取消可观察且超额不会再出站', async () =>
  localRelay('headers', async (relay, count) => {
    const signal = new AbortController();
    const response = await post(relay, signal.signal);
    await waitEvent(relay, 'upstream-complete');
    signal.abort();
    await assert.rejects(response.text());
    await waitEvent(relay, 'delivery-closed');
    await assert.rejects(post(relay));
    assert.equal(count(), 1);
    assert.equal(relay.counts.dispatched, 1);
  }));

test('仅心跳没有模型正文；真实源响应与目标交付分别记录', async () =>
  localRelay('heartbeat', async (relay) => {
    const signal = new AbortController();
    const response = await post(relay, signal.signal);
    const part = await response.body.getReader().read();
    assert.match(Buffer.from(part.value).toString(), /^: delivery-heartbeat/);
    await waitEvent(relay, 'upstream-complete');
    signal.abort();
    await waitEvent(relay, 'delivery-closed');
    assert(!relay.events.some((event) => event.kind.includes('content-')));
  }));

test('输出间隔样本只交付来自原始流且不能完成JSON的首内容帧', async () =>
  localRelay('idle', async (relay) => {
    const signal = new AbortController();
    const response = await post(relay, signal.signal);
    const part = await response.body.getReader().read();
    assert(raw.includes(Buffer.from(part.value)));
    assert.equal(
      JSON.parse(Buffer.from(part.value).toString().slice(6).trim()).choices[0].delta.content,
      '{"message":"',
    );
    signal.abort();
    await waitEvent(relay, 'delivery-closed');
  }));

test('绝对期限样本首用途原文正常交付，第二用途只节流真实不完整内容', async () =>
  localRelay('deadline', async (relay, count) => {
    assert.equal(await (await post(relay)).text(), raw.toString());
    const signal = new AbortController();
    const response = await post(relay, signal.signal);
    const reader = response.body.getReader();
    await reader.read();
    await waitEvent(relay, 'content-progress-delivered');
    signal.abort();
    await waitEvent(relay, 'delivery-closed', 2);
    assert.equal(count(), 2);
    assert.equal(relay.counts.dispatched, 2);
  }));

test('真实模式禁止非Cloudflare端点及更改进度间隔', async () => {
  await assert.rejects(
    createTargetFaultRelay({ scenario: 'headers', upstreamBase: 'http://127.0.0.1/v1', limit: 1 }),
  );
  await assert.rejects(
    createTargetFaultRelay({
      scenario: 'deadline',
      upstreamBase: 'https://api.cloudflare.com/client/v4/accounts/example/ai/v1',
      limit: 2,
      intervalMs: 1,
    }),
  );
});
