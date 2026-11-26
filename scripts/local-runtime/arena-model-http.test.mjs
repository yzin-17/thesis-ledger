import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createArenaModelHttpClient } from './arena-model-http.mjs';

test('HTTPS 保留模型 URL、请求正文和鉴权，返回可解析用量且仅发送一次', async () => {
  let calls = 0;
  const body = JSON.stringify({ model: 'gpt-6-luna', messages: [], response_format: { type: 'json_object' } });
  const client = await createArenaModelHttpClient((url, options, callback) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.authorization, 'Bearer controlled');
    assert.equal(options.headers.connection, 'close'); assert.equal(options.agent, false);
    const outgoing = new EventEmitter();
    outgoing.end = value => {
      assert.equal(value.toString(), body);
      const response = Readable.from([Buffer.from(JSON.stringify({ usage: { prompt_tokens: 7, completion_tokens: 3 } }))]);
      response.statusCode = 200; response.headers = { 'content-type': 'application/json', 'x-request-id': 'controlled' };
      callback(response);
    };
    return outgoing;
  });
  const response = await client('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer controlled', 'content-type': 'application/json' }, body,
  });
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-request-id'), 'controlled');
  assert.deepEqual((await response.json()).usage, { prompt_tokens: 7, completion_tokens: 3 }); assert.equal(calls, 1);
});

test('HTTPS 网络错误不重发，保留未知结果', async () => {
  let calls = 0;
  const client = await createArenaModelHttpClient(() => {
    calls++; const outgoing = new EventEmitter();
    outgoing.end = () => queueMicrotask(() => outgoing.emit('error', new Error('socket closed')));
    return outgoing;
  });
  await assert.rejects(client('https://api.openai.com/v1/chat/completions', { method: 'POST', body: '{}' }), /socket closed/);
  assert.equal(calls, 1);
});

test('HTTPS 拒绝改变上游地址', async () => {
  const client = await createArenaModelHttpClient(() => { throw new Error('不应发送'); });
  await assert.rejects(client('https://example.com/v1/chat/completions'), /目标不符/);
});
