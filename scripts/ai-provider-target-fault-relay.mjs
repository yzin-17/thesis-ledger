import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { targetFaultModel } from './ai-provider-target-fault-requests.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const incomplete = (value) => {
  try {
    JSON.parse(value);
    return false;
  } catch {
    return true;
  }
};

export function targetFaultFrames(raw) {
  const frames = raw
    .toString('utf8')
    .split(/\r?\n\r?\n/)
    .filter(Boolean);
  const safe = [];
  let text = '';
  let first = null;
  let model = null;
  let usage = null;
  let prefixClosed = false;
  let pending = [];
  for (const frame of frames) {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (!data || data === '[DONE]') continue;
    const parsed = JSON.parse(data);
    model = parsed.model ?? model;
    usage = parsed.usage ?? usage;
    if (parsed.choices?.some((choice) => choice.finish_reason)) continue;
    const delta = parsed.choices?.map((choice) => choice.delta?.content ?? '').join('') ?? '';
    if (prefixClosed) continue;
    const bytes = Buffer.from(frame + '\n\n');
    if (!delta) {
      pending.push(bytes);
      continue;
    }
    const next = text + delta;
    if (!incomplete(next)) {
      prefixClosed = true;
      continue;
    }
    text = next;
    pending.push(bytes);
    if (delta.trim()) {
      const chunk = Buffer.concat(pending);
      safe.push(chunk);
      first ??= chunk;
      pending = [];
    }
  }
  assert(first, '没有不可完成的真实内容前缀');
  assert(incomplete(text), '不可交付完整JSON');
  return { safe, first, model, usage, frameCount: frames.length };
}

export function assertTargetFaultModelRequest(path, body, dispatched, limit) {
  assert.equal(path, '/v1/chat/completions');
  assert.equal(body.model, targetFaultModel);
  assert.equal(body.stream, true);
  assert.equal(body.response_format?.type, 'json_object');
  assert.equal(body.chat_template_kwargs?.enable_thinking, false);
  assert(dispatched < limit, '本样本真实模型请求已达上限');
}

export async function createTargetFaultRelay({
  scenario,
  upstreamBase,
  limit,
  live = true,
  onEvent = () => {},
  intervalMs = 20000,
}) {
  assert(['guard', 'headers', 'heartbeat', 'idle', 'deadline'].includes(scenario));
  let expectedLimit = 1;
  if (scenario === 'guard') expectedLimit = 0;
  else if (scenario === 'deadline') expectedLimit = 2;
  assert.equal(limit, expectedLimit, '场景次数不得扩大');
  if (live && scenario !== 'guard') {
    const url = new URL(upstreamBase);
    assert.equal(url.origin, 'https://api.cloudflare.com');
    assert.match(url.pathname, /^\/client\/v4\/accounts\/[^/]+\/ai\/v1\/?$/);
    assert.equal(intervalMs, 20000);
  }
  const counts = { requests: 0, dispatched: 0 };
  const events = [];
  const event = (value) => {
    const row = { at: new Date().toISOString(), scenario, ...value };
    events.push(row);
    onEvent(row);
  };
  const server = createServer((request, response) => {
    counts.requests += 1;
    const requestIndex = counts.requests;
    const cancelled = new AbortController();
    let heartbeat;
    let upstreamComplete = false;
    response.once('close', () => {
      clearInterval(heartbeat);
      cancelled.abort();
      event({
        kind: 'delivery-closed',
        requestIndex,
        ended: response.writableEnded,
        upstreamComplete,
      });
    });
    void (async () => {
      assert.notEqual(scenario, 'guard', '费用拒绝未阻断请求');
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        assert(size <= 2 * 1024 * 1024);
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      const body = JSON.parse(bytes);
      assert.equal(request.method, 'POST');
      assertTargetFaultModelRequest(request.url, body, counts.dispatched, limit);
      counts.dispatched += 1;
      event({ kind: 'model-dispatch', requestIndex, requestSha256: hash(bytes) });
      const headers = Object.fromEntries(
        Object.entries(request.headers).filter(
          ([key]) =>
            ![
              'host',
              'connection',
              'content-length',
              'transfer-encoding',
              'accept-encoding',
            ].includes(key),
        ),
      );
      const upstream = await fetch(`${upstreamBase.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers,
        body: bytes,
        redirect: 'error',
        signal: AbortSignal.any([cancelled.signal, AbortSignal.timeout(180000)]),
      });
      event({ kind: 'upstream-headers', requestIndex, status: upstream.status });
      assert.equal(upstream.status, 200, '真实上游非200，停止故障样本');
      response.writeHead(200, {
        'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
      });
      response.flushHeaders();
      if (scenario === 'heartbeat') {
        response.write(': delivery-heartbeat\n\n');
        heartbeat = setInterval(() => response.write(': delivery-heartbeat\n\n'), 1000);
        event({ kind: 'heartbeat-only-started', requestIndex });
      }
      const parts = [];
      let length = 0;
      for await (const part of upstream.body ?? []) {
        length += part.length;
        assert(length <= 16 * 1024 * 1024);
        parts.push(part);
      }
      const raw = Buffer.concat(parts);
      upstreamComplete = true;
      const frames = targetFaultFrames(raw);
      event({
        kind: 'upstream-complete',
        requestIndex,
        bytes: raw.length,
        responseSha256: hash(raw),
        actualModel: frames.model,
        usage: frames.usage,
        frameCount: frames.frameCount,
        safeContentFrames: frames.safe.length,
      });
      if (scenario === 'deadline' && requestIndex === 1) {
        response.end(raw);
        event({ kind: 'first-purpose-delivered', requestIndex });
        return;
      }
      if (scenario === 'idle') {
        response.write(frames.first);
        event({ kind: 'content-prefix-delivered', requestIndex, bytes: frames.first.length });
      }
      if (scenario === 'deadline') {
        assert(frames.safe.length >= 32, '真实进度帧不足，不合成或补发');
        for (let i = 0; i < 32 && !cancelled.signal.aborted; i++) {
          response.write(frames.safe[i]);
          event({ kind: 'content-progress-delivered', requestIndex, index: i });
          await new Promise((resolve) => {
            const timer = setTimeout(done, intervalMs);
            function done() {
              clearTimeout(timer);
              cancelled.signal.removeEventListener('abort', done);
              resolve();
            }
            cancelled.signal.addEventListener('abort', done, { once: true });
          });
        }
      }
      if (!cancelled.signal.aborted) await once(cancelled.signal, 'abort');
    })().catch((error) => {
      event({
        kind: 'relay-rejected',
        requestIndex,
        error: error instanceof assert.AssertionError ? error.message : error.name,
      });
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' });
      response.destroy();
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    origin: `http://127.0.0.1:${server.address().port}/v1`,
    counts,
    events,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
