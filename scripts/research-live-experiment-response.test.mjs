import assert from 'node:assert/strict';
import test from 'node:test';
import { observeExperimentResponse } from './research-live-experiment-response.mjs';

test('跨分片SSE记录上游生成ID与实际模型，响应字节保持', async () => {
  const text =
    ': heartbeat\ndata: ' +
    JSON.stringify({
      id: 'gen-upstream-123',
      model: 'vendor/model:free',
      choices: [{ delta: { content: '中文' } }],
    }) +
    '\n\ndata: [DONE]\n\n';
  const bytes = new TextEncoder().encode(text),
    events = [];
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
      controller.close();
    },
  });
  const response = observeExperimentResponse(
    new Response(stream, { headers: { 'content-type': 'text/event-stream', 'x-safe': 'kept' } }),
    (v) => events.push(v),
  );
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.deepEqual(events.at(-1), {
    generationId: 'gen-upstream-123',
    actualModel: 'vendor/model:free',
    status: 'observed',
  });
  assert.equal(response.headers.get('x-safe'), 'kept');
  assert.equal(JSON.stringify(events).includes('中文'), false);
});

test('普通JSON可记录上游ID，本地UUID、上游chatcmpl与任意正文不替代生成ID', async () => {
  for (const id of ['gen-real-id', '00000000-0000-4000-8000-000000000001', 'chatcmpl-upstream']) {
    const value = { id, model: 'vendor/model', choices: [{ message: { content: 'private' } }] };
    const events = [];
    const response = observeExperimentResponse(new Response(JSON.stringify(value)), (v) =>
      events.push(v),
    );
    assert.deepEqual(await response.json(), value);
    assert.equal(events.at(-1).generationId, id.startsWith('gen-') ? id : null);
    assert.equal(JSON.stringify(events).includes('private'), false);
  }
});

test('错误与超限只记录缺失状态，不消费或改写原错误/响应', async () => {
  const events = [];
  const error = new Response('{"error":{"code":429}}', { status: 429 });
  assert.equal(
    observeExperimentResponse(error, (v) => events.push(v)),
    error,
  );
  assert.equal((await error.json()).error.code, 429);
  assert.equal(events[0].generationId, null);
  const large = 'x'.repeat(70000),
    oversized = [];
  assert.equal(
    await observeExperimentResponse(new Response(large), (v) => oversized.push(v)).text(),
    large,
  );
  assert.equal(oversized.at(-1).status, 'over_limit');
});

test('消费者取消继续传递到原流，不为读取ID延长请求', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode(': wait\n'));
    },
    cancel() {
      cancelled = true;
    },
  });
  const observed = observeExperimentResponse(
    new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
    () => {},
  );
  const reader = observed.body.getReader();
  await reader.read();
  await reader.cancel();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(cancelled, true);
});
