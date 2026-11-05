import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { MarketNewsRequestV3, MarketNewsResponseV3 } from '@thesis-ledger/schemas';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { MarketNewsController } from '../../src/market/market-news.controller.js';
import { MarketNewsReader } from '../../src/market/market-news-reader.js';
import { MarketNewsFeedReader } from '../../src/market/market-news-feed-reader.js';
import type { MarketNewsResult } from '../../src/market/market-news-contract.js';

type Sample = {
  name: string;
  request: MarketNewsRequestV3;
  response: MarketNewsResponseV3 | null;
  requestValid: boolean;
};
const fixture = JSON.parse(
  readFileSync(
    new URL('../../../../packages/schemas/fixtures/news-search-v1.samples.json', import.meta.url),
    'utf8',
  ),
) as { samples: Sample[] };
const samples = fixture.samples.filter((sample) => sample.requestValid && sample.response !== null);
const available = samples.find((sample) => sample.name === 'available')!;
let active = available;
let upstreamStatus = 200;
let rawResponse: string | undefined;
let delayMs = 0;
let disconnect = false;
let app: INestApplication | undefined;
let baseUrl: string;
const calls: {
  path: string | undefined;
  authorization: string | undefined;
  body: MarketNewsRequestV3;
}[] = [];

async function handleUpstream(req: IncomingMessage, res: ServerResponse) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as MarketNewsRequestV3;
  calls.push({ path: req.url, authorization: req.headers.authorization, body });
  if (disconnect) {
    req.socket.destroy();
    return;
  }
  const response = structuredClone(active.response);
  if (response) response.requestId = body.requestId;
  if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  res.writeHead(upstreamStatus, { 'content-type': 'application/json' });
  res.end(rawResponse ?? JSON.stringify(response));
}
const upstream = createServer((req, res) => {
  void handleUpstream(req, res).catch(() => {
    if (!res.destroyed) {
      res.writeHead(500);
      res.end('{}');
    }
  });
});

beforeAll(async () => {
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('受控 HTTP 地址缺失');
  const dsa = Object.assign(Object.create(DsaClient.prototype), {
    config: {
      dsaBaseUrl: `http://127.0.0.1:${address.port}`,
      dsaTimeoutMs: 500,
      dsaToken: 'controlled-data-token',
    },
  }) as DsaClient;
  class TestModule {}
  Module({
    controllers: [MarketNewsController],
    providers: [MarketNewsReader, MarketNewsFeedReader, { provide: DsaClient, useValue: dsa }],
  })(TestModule);
  app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});
beforeEach(() => {
  active = available;
  upstreamStatus = 200;
  rawResponse = undefined;
  delayMs = 0;
  disconnect = false;
  calls.length = 0;
});
afterAll(async () => {
  await app?.close();
  upstream.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    upstream.close((error) => (error ? reject(error) : resolve())),
  );
});

function publicInput(sample = active) {
  const { instrument, publishedStart, publishedEnd, limit, cursor, requestBudgetMs } =
    sample.request;
  return { instrument, publishedStart, publishedEnd, limit, cursor, requestBudgetMs };
}
async function post(input: unknown = publicInput(), query = '') {
  return fetch(`${baseUrl}/api/market-data/news${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}
async function result(input?: unknown): Promise<MarketNewsResult> {
  const response = await post(input);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return response.json() as Promise<MarketNewsResult>;
}

it.each(samples)('真实 Market HTTP → DsaClient → 受控 HTTP 共享样例：$name', async (sample) => {
  active = sample;
  const value = await result(publicInput(sample));
  expect(value).toMatchObject({
    instrument: sample.response!.instrument,
    status: sample.response!.status,
    items: sample.response!.items,
    coverage: sample.response!.coverage,
    source: sample.response!.route,
    errors: sample.response!.errors,
    fetchedAt: sample.response!.fetchedAt,
    upstreamAttempts: sample.response!.upstreamAttempts,
    nextCursor: sample.response!.nextCursor,
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    path: '/api/v3/thesis-ledger/market/news',
    authorization: 'Bearer controlled-data-token',
    body: { contractVersion: 'news-search-v1', capability: 'NEWS_SEARCH', requestBudgetMs: 500 },
  });
  expect(Object.keys(calls[0]!.body).sort()).toEqual(Object.keys(sample.request).sort());
});

it.each([
  { accountId: 'private' },
  { holdings: [{ symbol: '600519.SH' }] },
  { prompt: '跨账户执行' },
  { providerId: 'unapproved' },
  { sdkOptions: {} },
  { asOf: '2020-01-01' },
  { requestBudgetMs: 0 },
  { instrument: { market: 'US', assetType: 'STOCK', symbol: '600519.SH' } },
  { publishedStart: '2026-10-18T00:00:00Z', publishedEnd: '2026-10-17T00:00:00Z' },
])('非法新闻输入在数据请求前拒绝：%j', async (fields) => {
  const response = await post({ ...publicInput(), ...fields });
  expect(response.status).toBe(400);
  expect(calls).toHaveLength(0);
});

it('额外 query 不能绕过严格 body', async () => {
  expect((await post(publicInput(), '?providerId=other')).status).toBe(400);
  expect(calls).toHaveLength(0);
});

it('市场快讯通过真实 Market HTTP 和认证 DSA HTTP 消费同版合同', async () => {
  const feed = JSON.parse(
    readFileSync(
      new URL('../../../../packages/schemas/fixtures/news-feed-v1.sample.json', import.meta.url),
      'utf8',
    ),
  );
  active = {
    name: 'controlled-feed',
    request: feed.request,
    response: feed.response,
    requestValid: true,
  } as Sample;
  const response = await fetch(`${baseUrl}/api/market-data/news-feed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ market: 'CN', providerId: 'cls', limit: 5 }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchObject({
    market: 'CN',
    items: feed.response.items,
    source: feed.response.route,
    coverage: feed.response.coverage,
    upstreamAttempts: 1,
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    path: '/api/v3/thesis-ledger/market/news-feed',
    authorization: 'Bearer controlled-data-token',
    body: { capability: 'NEWS_FEED', providerId: 'cls' },
  });
});

it('同查询身份稳定但不跨请求复用，路由/策略/凭据修订隔离', async () => {
  const first = await result();
  expect(first.cacheIdentity).toMatch(/^market-news-v1:[a-f0-9]{64}$/);
  expect((await result()).cacheIdentity).toBe(first.cacheIdentity);
  expect(calls).toHaveLength(2);
  for (const key of ['policyRevision', 'routeRevision', 'credentialRevision'] as const) {
    active = structuredClone(available);
    active.response!.route![key] = 'changed';
    expect((await result()).cacheIdentity).not.toBe(first.cacheIdentity);
  }
  active = available;
  expect((await result({ ...publicInput(), limit: 10 })).cacheIdentity).not.toBe(
    first.cacheIdentity,
  );
  expect((await result({ ...publicInput(), cursor: 'page-two' })).cacheIdentity).not.toBe(
    first.cacheIdentity,
  );
});

it('已校验的 HTTP 未准入保留零尝试、覆盖和全部来源错误', async () => {
  active = samples.find((sample) => sample.name === 'not_admitted')!;
  upstreamStatus = 503;
  expect(await result()).toMatchObject({
    status: 'unavailable',
    errors: active.response!.errors,
    fetchedAt: active.response!.fetchedAt,
    upstreamAttempts: 0,
    cacheIdentity: null,
  });
  expect(calls).toHaveLength(1);
});

it.each([
  [404, 'unsupported'],
  [401, 'service_unauthorized'],
  [403, 'service_unauthorized'],
  [200, 'invalid_response'],
] as const)('HTTP %s 的无合同载荷明确不可用，不伪装成功空检索', async (status, code) => {
  upstreamStatus = status;
  rawResponse = 'not-json';
  expect(await result()).toMatchObject({
    status: 'unavailable',
    items: [],
    source: null,
    fetchedAt: null,
    upstreamAttempts: null,
    cacheIdentity: null,
    errors: [{ code }],
    coverage: { complete: false },
  });
  expect(calls).toHaveLength(1);
});

it('请求超时保持未知抓取时点及尝试次数', async () => {
  delayMs = 150;
  expect(await result({ ...publicInput(), requestBudgetMs: 30 })).toMatchObject({
    status: 'unavailable',
    fetchedAt: null,
    upstreamAttempts: null,
    errors: [{ code: 'timeout' }],
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]!.body.requestBudgetMs).toBe(30);
});

it('连接中断不重试，不回退原生分析', async () => {
  disconnect = true;
  expect(await result()).toMatchObject({
    status: 'unavailable',
    errors: [{ code: 'service_unavailable' }],
    upstreamAttempts: null,
  });
  expect(calls.map((call) => call.path)).toEqual(['/api/v3/thesis-ledger/market/news']);
});

it.each([
  [404, 'not_covered'],
  [403, 'missing_credentials'],
] as const)('HTTP %s 的合法来源错误保持原始分类', async (status, code) => {
  active = structuredClone(samples.find((sample) => sample.name === 'not_admitted')!);
  active.response!.errors[0]!.code = code;
  upstreamStatus = status;
  expect(await result()).toMatchObject({
    status: 'unavailable',
    upstreamAttempts: 0,
    errors: active.response!.errors,
    fetchedAt: active.response!.fetchedAt,
  });
  expect(calls).toHaveLength(1);
});
