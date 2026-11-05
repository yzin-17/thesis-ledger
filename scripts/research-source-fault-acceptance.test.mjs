import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import {
  sourceFaultOptions,
  runSourceFaultAcceptance,
} from './research-source-fault-acceptance.mjs';
import { assertSourceFaultIsolation } from './research-source-fault-runtime.mjs';
import {
  assertSourceFaultRequest,
  createSourceFaultRelay,
  sourceFaultModel,
  sourceFaultNewsPath,
} from './research-source-fault-relay.mjs';

const scope = { start: '2026-10-24', end: '2026-10-31' };
const newsBody = () => ({
  instrument: { market: 'CN', assetType: 'STOCK', symbol: '600519.SH' },
  limit: 10,
  cursor: null,
  publishedStart: '2026-10-24T00:00:00+08:00',
  publishedEnd: '2026-10-31T10:00:00+08:00',
});
const packet = () => ({
  mode: 'controlled',
  containerName: 'ledger-research-source-fault-1234abcd',
  scope,
  isolatedUrl:
    'postgresql://fixture_owner:fixture@ledger-research-source-fault-1234abcd:5432/research_source_fault_fixture',
});

test('默认计划不创建Docker、不读凭据、不发外部请求', async () => {
  const result = await runSourceFaultAcceptance(sourceFaultOptions([]));
  assert.equal(result.mode, 'plan');
  for (const key of ['dockerMutations', 'credentialReads', 'externalSourceCalls', 'realModelCalls'])
    assert.equal(result[key], 0);
});
test('错误模式、未知参数及缺少独立证据目录在执行前拒绝', () => {
  for (const args of [
    ['--mode', 'other'],
    ['--unknown'],
    ['--execute'],
    ['--mode'],
    ['--execute', '--output', '/tmp/not-owned'],
  ])
    assert.throws(() => sourceFaultOptions(args));
});
test('隔离数据库必须匹配所属容器、专库和角色', () => {
  assertSourceFaultIsolation(packet());
  for (const isolatedUrl of [
    'postgresql://fixture_owner:fixture@localhost/thesis_ledger',
    'postgresql://postgres:fixture@ledger-research-source-fault-1234abcd/research_source_fault_fixture',
    'postgresql://fixture_owner:fixture@other/research_source_fault_fixture',
  ])
    assert.throws(() => assertSourceFaultIsolation({ ...packet(), isolatedUrl }));
});
test('真实模式要求显式授权和未到期的精确单源', () => {
  const live = {
    ...packet(),
    mode: 'live',
    scope: {
      ...scope,
      authorized: true,
      providerId: 'hithink',
      upstreamSource: 'hithink-news-stock-timeline',
      symbol: '600519.SH',
      validUntil: new Date(Date.now() + 60000).toISOString(),
    },
  };
  assertSourceFaultIsolation(live);
  for (const change of [
    { authorized: false },
    { validUntil: '2026-01-01T00:00:00Z' },
    { symbol: '600000.SH' },
    { upstreamSource: 'other' },
  ])
    assert.throws(() =>
      assertSourceFaultIsolation({ ...live, scope: { ...live.scope, ...change } }),
    );
});
test('来源请求只能单标的、首个游标、10条和获准日期', () => {
  assertSourceFaultRequest(newsBody(), scope);
  for (const change of [
    { limit: 11 },
    { cursor: 'next' },
    { publishedStart: '2026-10-23T00:00:00+08:00' },
    { publishedEnd: '2026-11-01T00:00:00+08:00' },
    { instrument: { ...newsBody().instrument, symbol: '600000.SH' } },
  ])
    assert.throws(() => assertSourceFaultRequest({ ...newsBody(), ...change }, scope));
});

const upstream = async () => {
  const counts = { ai: 0, news: 0 };
  const server = createServer((request, response) => {
    if (request.url.includes('chat/completions')) {
      counts.ai++;
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      return response.end('data: [DONE]\n\n');
    }
    counts.news++;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        route: { providerId: 'hithink', upstreamSource: 'hithink-news-stock-timeline' },
        items: [{}],
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    counts,
    origin: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
};
const post = (url, body, signal) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

test('实际收到上游响应后断开交付；相同样本重发不会再次访问上游', async () => {
  const source = await upstream();
  const relay = await createSourceFaultRelay({
    dsaBase: source.origin,
    aiBase: source.origin,
    scope,
    live: false,
  });
  try {
    relay.setScenario('partial');
    await assert.rejects(post(relay.origin + sourceFaultNewsPath, newsBody()));
    assert(
      relay.events.some((event) => event.kind === 'news-upstream-complete' && event.status === 200),
    );
    assert(relay.events.some((event) => event.kind === 'news-delivery-disconnected'));
    assert.equal((await post(relay.origin + sourceFaultNewsPath, newsBody())).status, 502);
    assert.equal(source.counts.news, 1);
  } finally {
    await relay.close();
    await source.close();
  }
});
test('保持交付直到调用方取消，源响应事实与客户端断开分别记录', async () => {
  const source = await upstream();
  let closed;
  const observedClose = new Promise((resolve) => {
    closed = resolve;
  });
  const relay = await createSourceFaultRelay({
    dsaBase: source.origin,
    aiBase: source.origin,
    scope,
    live: false,
    onEvent: (event) => {
      if (event.kind === 'news-delivery-closed') closed(event);
    },
  });
  try {
    await assert.rejects(
      post(relay.origin + sourceFaultNewsPath, newsBody(), AbortSignal.timeout(150)),
    );
    const event = await Promise.race([
      observedClose,
      new Promise((_, reject) => setTimeout(() => reject(new Error('未断开')), 2000)),
    ]);
    assert.equal(event.scenario, 'timeout');
    assert.equal(event.completed, false);
    assert.equal(source.counts.news, 1);
    assert.equal(relay.counts.ai, 0);
  } finally {
    await relay.close();
    await source.close();
  }
});
test('模型仅一次、仅指定Qwen；额外请求在外部派发前拒绝', async () => {
  const source = await upstream();
  const relay = await createSourceFaultRelay({
    dsaBase: source.origin,
    aiBase: source.origin,
    scope,
    live: false,
  });
  try {
    relay.setScenario('partial');
    const url = relay.origin + '/cloudflare/v1/chat/completions';
    assert.equal((await post(url, { model: 'other', stream: true })).status, 502);
    assert.equal(source.counts.ai, 0);
    await (await post(url, { model: sourceFaultModel, stream: true })).text();
    assert.equal((await post(url, { model: sourceFaultModel, stream: true })).status, 502);
    assert.equal(source.counts.ai, 1);
  } finally {
    await relay.close();
    await source.close();
  }
});
