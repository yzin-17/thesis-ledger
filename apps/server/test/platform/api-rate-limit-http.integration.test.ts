import 'reflect-metadata';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiRateLimitMiddleware } from '../../src/platform/api-rate-limit.js';
import { IdentityService } from '../../src/identity/identity.service.js';
import { identityRateLimitSubject } from '../../src/identity/identity-rate-limit-subject.js';
import { createHash } from 'node:crypto';

let app: INestApplication;
let baseUrl: string;
let now = 0;
const handled: string[] = [];
const tokenA = 'a'.repeat(43), tokenB = 'b'.repeat(43);

beforeEach(async () => {
  now = 0; handled.length = 0;
  vi.stubEnv('STRATEGY_IDENTITY_MODE', 'account');
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const users = new Map([tokenA, tokenB].map((token, i) => [createHash('sha256').update(token).digest('hex'), {
    user: { id: `11111111-1111-4111-8111-11111111111${i}`, username: `fixture-${i}`, displayName: '隔离用户', enabled: true },
    revokedAt: null, expiresAt: new Date(600_000),
  }]));
  const identities = new IdentityService({ identitySession: {
    findUnique: async ({ where }: { where: { tokenDigest: string } }) => users.get(where.tokenDigest) ?? null,
  } } as never);
  class ProbeModule {}
  Module({})(ProbeModule);
  app = await NestFactory.create(ProbeModule, { logger: false });
  app.use(createApiRateLimitMiddleware({ resolveSubject: identityRateLimitSubject(identities) }));
  app.use((request: Request, response: Response) => {
    handled.push(`${request.method} ${request.path}`);
    response.status(200).json({ source: 'isolated-http-probe' });
  });
  await app.listen(0, '127.0.0.1'); baseUrl = await app.getUrl();
});
afterEach(async () => { await app?.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function request(path: string, method = 'GET', token = tokenA) {
  const result = await fetch(`${baseUrl}${path}`, { method, headers: { 'x-thesis-ledger-session': token } });
  await result.text();
  return result;
}

describe('真实 HTTP 的成本分类与负载', () => {
  it('八页六路 1.5 秒轮询、1 秒监测跨两个窗口，正常初始化及 POST 查询均无 429', async () => {
    const paths = ['/api/v1/backtests/runs', '/api/v1/ai/runs', '/api/v1/strategy-submissions',
      '/api/v1/strategy-authoring/operations/task', '/api/v1/strategy-optimization/experiments', '/api/v1/research/reports'];
    let total = 0;
    for (let minute = 0; minute < 2; minute++) {
      now = minute * 60_000;
      const initial = await Promise.all(Array.from({ length: 80 }, () => request('/api/v1/backtests/strategies')));
      expect(initial.every((x) => x.status === 200)).toBe(true); total += initial.length;
      for (let tick = 0; tick < 120; tick++) {
        now = minute * 60_000 + tick * 500;
        if (tick % 2 === 0) {
          const monitors = await Promise.all(Array.from({ length: 8 }, () => request('/api/market-data/rule-monitor')));
          expect(monitors.every((x) => x.status === 200)).toBe(true); total += monitors.length;
        }
        if (tick % 3 !== 0) continue;
        const batch = Array.from({ length: 8 }, () => [
          ...paths.map((path) => request(path)),
          request('/api/v1/watchlist/prices', 'POST'),
          request('/api/v1/research/submissions/find', 'POST'),
        ]).flat();
        const result = await Promise.all(batch);
        expect(result.every((x) => x.status === 200)).toBe(true); total += result.length;
      }
    }
    expect(total).toBe(6240);
    expect(handled).toHaveLength(total);
  }, 30_000);

  it('任务、模型及鉴权过量被拒绝，不能执行处理器；正常读取和取消持续可用', async () => {
    const concurrent = await Promise.all(Array.from({ length: 21 }, () => request('/api/v1/backtests/runs', 'POST')));
    expect(concurrent.filter((result) => result.status === 200)).toHaveLength(20);
    expect(concurrent.filter((result) => result.status === 429)).toHaveLength(1);
    const count = handled.length;
    const blocked = await request('/api/v1/backtests/runs', 'POST');
    expect(blocked.status).toBe(429); expect(blocked.headers.get('retry-after')).toBe('60');
    expect(handled).toHaveLength(count);
    expect((await request('/api/v1/backtests/runs', 'POST', tokenB)).status).toBe(200);
    expect((await request('/api/v1/backtests/runs/id/cancel', 'POST')).status).toBe(200);
    expect((await request('/api/v1/backtests/runs')).status).toBe(200);
    for (let i = 0; i < 10; i++) expect((await request('/api/v1/ai/runs', 'POST')).status).toBe(200);
    expect((await request('/api/v1/ai/runs', 'POST')).status).toBe(429);
    for (let i = 0; i < 10; i++) expect((await request('/api/v1/identity/sessions', 'POST', `fake-${i}`)).status).toBe(200);
    expect((await request('/api/v1/identity/sessions', 'POST', tokenB)).status).toBe(429);
    now = 60_000;
    expect((await request('/api/v1/backtests/runs', 'POST')).status).toBe(200);
    expect((await request('/api/v1/identity/sessions', 'POST')).status).toBe(200);
  });
});
