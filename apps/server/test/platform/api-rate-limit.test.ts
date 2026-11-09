import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { ApiRateLimiter, createApiRateLimitMiddleware } from '../../src/platform/api-rate-limit.js';

async function probe(
  middleware: ReturnType<typeof createApiRateLimitMiddleware>, method: string, path: string,
  ip = 'isolated-client', user?: string,
) {
  let status = 200;
  const headers: Record<string, number> = {};
  const response = {
    locals: {} as Record<string, unknown>,
    status: vi.fn((value: number) => { status = value; return response; }),
    setHeader: vi.fn((key: string, value: number) => { headers[key] = value; return response; }),
    json: vi.fn(),
  };
  const next = vi.fn();
  const request = { ip, socket: {}, method, path, header: () => user } as unknown as Request;
  await middleware(request, response as unknown as Response, next);
  return { status, headers, next, policy: response.locals.apiRateLimitPolicy };
}

afterEach(() => vi.useRealTimers());

describe('API 成本限流与浏览负载', () => {
  it('连续三分钟八个页面各六个 1.5 秒轮询、1 秒来源监测、首次浏览及报价，不产生 429', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const middleware = createApiRateLimitMiddleware({ resolveSubject: async () => 'same-user' });
    const polls = ['/backtests/runs', '/ai/runs', '/strategy-submissions',
      '/strategy-authoring/operations/task', '/strategy-optimization/experiments', '/research/reports'];
    for (let minute = 0; minute < 3; minute++) {
      for (let tab = 0; tab < 8; tab++) {
        for (let j = 0; j < 10; j++)
          expect((await probe(middleware, 'GET', `/api/v1/backtests/strategies?page=${j}`)).status).toBe(200);
      }
      for (let tick = 0; tick < 120; tick++) {
        vi.setSystemTime(minute * 60_000 + tick * 500);
        if (tick % 2 === 0) {
          for (let tab = 0; tab < 8; tab++)
            expect((await probe(middleware, 'GET', '/api/market-data/rule-monitor')).status).toBe(200);
        }
        if (tick % 3 !== 0) continue;
        for (let tab = 0; tab < 8; tab++) {
          for (const path of polls) expect((await probe(middleware, 'GET', `/api/v1${path}`)).status).toBe(200);
          expect((await probe(middleware, 'POST', '/api/v1/watchlist/prices')).status).toBe(200);
          expect((await probe(middleware, 'POST', '/api/v1/backtests/run-config/prepare')).status).toBe(200);
        }
      }
      vi.setSystemTime((minute + 1) * 60_000);
    }
  });

  it('重任务额度用尽仍能读取、保存、取消和按 POST 查询', async () => {
    const middleware = createApiRateLimitMiddleware();
    for (let i = 0; i < 20; i++) expect((await probe(middleware, 'POST', '/api/v1/backtests/runs')).status).toBe(200);
    const blocked = await probe(middleware, 'POST', '/api/v1/backtests/runs');
    expect(blocked).toMatchObject({ status: 429, policy: 'task' });
    expect(blocked.headers['retry-after']).toBeGreaterThan(0);
    expect(blocked.next).not.toHaveBeenCalled();
    for (const [method, path] of [['GET', '/identity/context'], ['GET', '/backtests/runs'],
      ['POST', '/backtests/runs/id/cancel'], ['PATCH', '/strategy-authoring/drafts/id'],
      ['POST', '/research/submissions/find']])
      expect((await probe(middleware, method!, `/api/v1${path}`)).status).toBe(200);
  });

  it('不同任务操作仍共享任务总预算，不能轮换任务类型绕过', async () => {
    const middleware = createApiRateLimitMiddleware();
    for (const path of ['/backtests/runs', '/backtests/runs/nav']) {
      for (let i = 0; i < 20; i++) expect((await probe(middleware, 'POST', `/api/v1${path}`)).status).toBe(200);
    }
    expect((await probe(middleware, 'POST', '/api/v1/backtests/runs/id/retry')).status).toBe(429);
  });

  it('动态资源、查询、HEAD 和大小写共用同一读取操作额度，另一个接口仍可用', async () => {
    const middleware = createApiRateLimitMiddleware();
    for (let i = 0; i < 600; i++)
      expect((await probe(middleware, i % 2 ? 'GET' : 'HEAD', `/api/v1/backtests/runs/id-${i}?page=${i}`)).status).toBe(200);
    expect((await probe(middleware, 'GET', '/API/V1/BACKTESTS/RUNS/other/')).status).toBe(429);
    expect((await probe(middleware, 'GET', '/api/v1/backtests/strategies')).status).toBe(200);
  });

  it('同一 IP 的已验证用户独立，换会话仍属于同一用户', async () => {
    const middleware = createApiRateLimitMiddleware({ resolveSubject: async (r) => r.header('user') });
    for (let i = 0; i < 10; i++)
      expect((await probe(middleware, 'POST', '/api/v1/ai/runs', 'shared-ip', 'a')).status).toBe(200);
    expect((await probe(middleware, 'POST', '/api/v1/ai/runs', 'shared-ip', 'a')).status).toBe(429);
    expect((await probe(middleware, 'POST', '/api/v1/ai/runs', 'shared-ip', 'b')).status).toBe(200);
  });

  it('匿名或无效会话使用同一 IP 兜底，登录注册不信任会话头', async () => {
    const resolveSubject = vi.fn(async () => undefined);
    const middleware = createApiRateLimitMiddleware({ resolveSubject });
    for (let i = 0; i < 10; i++)
      expect((await probe(middleware, 'POST', '/api/v1/identity/sessions', 'ip', `fake-${i}`)).status).toBe(200);
    expect(resolveSubject).not.toHaveBeenCalled();
    expect((await probe(middleware, 'POST', '/api/v1/identity/sessions', 'ip', 'new-fake')).status).toBe(429);
    expect((await probe(middleware, 'POST', '/api/v1/identity/sessions', 'other-ip')).status).toBe(200);
    for (let i = 0; i < 10; i++) expect((await probe(middleware, 'POST', '/api/v1/ai/runs', 'ip', `fake-${i}`)).status).toBe(200);
    expect((await probe(middleware, 'POST', '/api/v1/ai/runs', 'ip', 'another')).status).toBe(429);
  });

  it('高总量来源保护仍有效，健康观察与 OPTIONS 不被业务请求饿死', async () => {
    const middleware = createApiRateLimitMiddleware({ resolveSubject: async (r) => r.header('user') });
    for (let i = 0; i < 12_000; i++)
      expect((await probe(middleware, 'GET', '/api/v1/accounts', 'network', `user-${i}`)).status).toBe(200);
    expect(await probe(middleware, 'GET', '/api/v1/identity/context', 'network')).toMatchObject({ status: 429, policy: 'network' });
    expect((await probe(middleware, 'GET', '/api/v1/health', 'network')).status).toBe(200);
    expect((await probe(middleware, 'OPTIONS', '/api/v1/accounts', 'network')).status).toBe(200);
  });

  it('窗口恢复、拒绝原子性及状态容量保护', () => {
    const limiter = new ApiRateLimiter(1000, 3);
    const op = { key: 'op', limit: 1 }, cost = { key: 'cost', limit: 2 };
    expect(limiter.consume([op, cost], 0).allowed).toBe(true);
    expect(limiter.consume([op, cost], 2)).toEqual({ allowed: false, retryAfterMs: 998 });
    expect(limiter.consume([{ key: 'other', limit: 1 }, cost], 3).allowed).toBe(true);
    expect(limiter.consume([{ key: 'capacity', limit: 1 }], 4).allowed).toBe(false);
    expect(limiter.consume([op, cost], 1000).allowed).toBe(true);
    for (let i = 0; i < 256; i++) limiter.consume([op], 2001);
    expect(limiter.consume([{ key: 'capacity', limit: 1 }], 2002).allowed).toBe(true);
    const full = new ApiRateLimiter(1000, 1);
    expect(full.consume([{ key: 'old', limit: 1 }], 0).allowed).toBe(true);
    expect(full.consume([{ key: 'new', limit: 1 }], 1000).allowed).toBe(true);
  });

  it('主体解析故障返回可读 503，不降级匿名、执行处理器或暴露数据库错误', async () => {
    const error = new Error('database unavailable');
    const result = await probe(createApiRateLimitMiddleware({ resolveSubject: async () => { throw error; } }), 'GET', '/api/v1/accounts');
    expect(result.status).toBe(503);
    expect(result.policy).toBe('identity-unavailable');
    expect(result.next).not.toHaveBeenCalled();
  });
});
