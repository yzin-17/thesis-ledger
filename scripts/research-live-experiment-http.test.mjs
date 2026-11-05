import assert from 'node:assert/strict';
import test from 'node:test';
import { captureCloudflareExperimentResponse } from './research-live-experiment-http.mjs';

test('限流诊断只保留白名单来源、整数响应头及布尔提示，不保存错误正文', async () => {
  const body = JSON.stringify({
    error: {
      code: 429,
      message: 'Provider upstream rate limited synthetic-private-key',
      metadata: {
        limit_source: 'openrouter_key_limit',
        provider_code: 429,
        raw: 'synthetic-private-key',
      },
    },
  });
  const response = new Response(body, {
    status: 429,
    headers: { 'x-ratelimit-limit': '20', 'x-ratelimit-remaining': '0' },
  });
  const result = await captureCloudflareExperimentResponse(response);
  assert.equal(result.limitSource, 'openrouter_key_limit');
  assert.equal(result.providerErrorCode, 429);
  assert.deepEqual(result.rateLimit, { limit: 20, remaining: 0 });
  assert.equal(result.errorHints.upstreamRateLimited, true);
  assert(!JSON.stringify(result).includes('synthetic-private-key'));
  assert.equal(await response.text(), body);
});

test('错误副本只保留有限整数子码和标准重试时间，原响应仍可完整交给SDK', async () => {
  const body = JSON.stringify({
    errors: [{ code: 3036, message: 'synthetic-private-body' }, { code: '3036' }],
    error: { code: '3040', message: 'synthetic-private-key' },
    code: 'Bearer synthetic-private',
  });
  const response = new Response(body, {
    status: 429,
    headers: { 'cf-ray': 'synthetic-ray', 'retry-after': '3600' },
  });
  const result = await captureCloudflareExperimentResponse(response);
  assert.deepEqual(result.errorCodes, [3040, 3036]);
  assert.equal(result.retryAfterSeconds, 3600);
  assert.equal(result.cfRay, 'synthetic-ray');
  assert.equal(result.errorBodyStatus, 'parsed');
  assert(!JSON.stringify(result).includes('synthetic-private'));
  assert.equal(response.bodyUsed, false);
  assert.equal(await response.text(), body);
});

test('正常SSE不读取或复制正文，HTTP日期与非法重试头分别处理', async () => {
  const response = new Response('data: synthetic\n\n', {
    headers: { 'retry-after': 'Sun, 01 Nov 2026 12:00:00 GMT' },
  });
  response.clone = () => {
    throw new Error('正常SSE不得复制');
  };
  const result = await captureCloudflareExperimentResponse(response);
  assert.equal(result.errorBodyStatus, 'not_needed');
  assert.equal(result.retryAfterAt, '2026-11-01T12:00:00.000Z');
  assert.equal(await response.text(), 'data: synthetic\n\n');
  for (const value of ['synthetic-private-key', 'Invalid Date']) {
    const invalid = await captureCloudflareExperimentResponse(
      new Response('', { headers: { 'retry-after': value } }),
    );
    assert.equal(invalid.retryAfterSeconds, null);
    assert.equal(invalid.retryAfterAt, null);
  }
});

test('错误副本读取在一秒内收尾，未结束正文不会使诊断无限等待', async () => {
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{'));
      },
    }),
    { status: 429 },
  );
  const started = Date.now();
  const result = await captureCloudflareExperimentResponse(response);
  assert.equal(result.errorBodyStatus, 'unavailable');
  assert(Date.now() - started < 5000);
  await response.body.cancel();
});

test('非JSON及超限错误不阻断SDK原响应，任意文本不落入摘要', async () => {
  for (const [body, expected] of [
    ['synthetic-private-error', 'unavailable'],
    ['x'.repeat(65537), 'over_limit'],
  ]) {
    const response = new Response(body, { status: 429 });
    const result = await captureCloudflareExperimentResponse(response);
    assert.equal(result.errorBodyStatus, expected);
    assert.deepEqual(result.errorCodes, []);
    assert(!JSON.stringify(result).includes('synthetic-private'));
    assert.equal(await response.text(), body);
  }
});
