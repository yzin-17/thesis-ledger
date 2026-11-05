import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveExperimentTransport } from './research-live-experiment-transport.mjs';

test('一个SDK请求只派发一次，旁路上游ID与原流均保留', async () => {
  let calls = 0,
    dispatched = 0;
  const files = new Map();
  const body = 'data: {"id":"gen-one","model":"vendor/model:free"}\n\ndata: [DONE]\n\n';
  const transport = createLiveExperimentTransport({
    providerId: 'openrouter',
    baseURL: 'https://openrouter.ai/api/v1',
    isFree: true,
    onDispatch: () => dispatched++,
    save: (name, value) => files.set(name, value),
    httpClient: async (_url, options) => {
      calls++;
      assert.equal(options.redirect, 'error');
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  const request = transport.forRequest('local-id');
  const response = await request('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
  });
  assert.equal(await response.text(), body);
  assert.equal(transport.providerGenerations()[0].generationId, 'gen-one');
  assert.equal(files.get('provider-response-ids.json')[0].localRequestId, 'local-id');
  await assert.rejects(() =>
    request('https://openrouter.ai/api/v1/chat/completions', { method: 'POST' }),
  );
  assert.equal(calls, 1);
  assert.equal(dispatched, 1);
});

test('非官方目标在派发前拒绝，429不重试且原错误仍可读取', async () => {
  let calls = 0;
  const transport = createLiveExperimentTransport({
    providerId: 'openrouter',
    baseURL: 'https://openrouter.ai/api/v1',
    isFree: false,
    onDispatch: () => {},
    save: () => {},
    httpClient: async () => {
      calls++;
      return new Response('{"error":{"code":429}}', { status: 429 });
    },
  });
  await assert.rejects(() =>
    transport.forRequest('wrong')('https://example.invalid/chat/completions', { method: 'POST' }),
  );
  assert.equal(calls, 0);
  const response = await transport.forRequest('right')(
    'https://openrouter.ai/api/v1/chat/completions',
    { method: 'POST' },
  );
  assert.equal((await response.json()).error.code, 429);
  assert.equal(calls, 1);
  assert.equal(transport.providerGenerations()[0].generationId, null);
});

test('保存实际序列化请求的输出设置，消息/凭据不进入回执且原请求不改变', async () => {
  const files = new Map();
  const body = JSON.stringify({
    model: '@cf/qwen/qwen3.8-27b',
    reasoning_effort: 'low',
    messages: [{ role: 'user', content: 'private-benchmark-content' }],
  });
  const transport = createLiveExperimentTransport({
    providerId: 'cloudflare',
    baseURL: 'https://api.cloudflare.com/client/v4/accounts/example/ai/v1',
    isFree: false,
    onDispatch: () => {},
    save: (name, value) => files.set(name, value),
    httpClient: async (_url, options) => {
      assert.equal(options.body, body);
      assert.equal(options.headers.Authorization, 'private-key');
      return new Response('{}');
    },
  });
  await transport.forRequest('one')(
    'https://api.cloudflare.com/client/v4/accounts/example/ai/v1/chat/completions',
    { method: 'POST', headers: { Authorization: 'private-key' }, body },
  );
  assert.deepEqual(files.get('wire-request-settings.json'), [
    {
      requestId: 'one',
      parsed: true,
      maxTokensPresent: false,
      maxCompletionTokensPresent: false,
      maxTokens: null,
      maxCompletionTokens: null,
      reasoningEffort: 'low',
    },
  ]);
  const saved = JSON.stringify([...files]);
  assert.equal(saved.includes('private-key'), false);
  assert.equal(saved.includes('private-benchmark-content'), false);
});
