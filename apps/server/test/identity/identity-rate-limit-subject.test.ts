import { createHash } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityService } from '../../src/identity/identity.service.js';
import { IdentityController } from '../../src/identity/identity.controller.js';
import { IdentityGuard } from '../../src/identity/identity.guard.js';
import { identityRateLimitSubject, type PrincipalRequest } from '../../src/identity/identity-rate-limit-subject.js';
import { StrategyIdentityGuard } from '../../src/backtest/strategy-identity.guard.js';

const principal = { id: '11111111-1111-4111-8111-111111111111', username: 'fixture-user', displayName: '隔离用户' };
function setup() {
  const session = { user: { ...principal, enabled: true }, revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 60_000) };
  const lookup = vi.fn(async () => session);
  const service = new IdentityService({ identitySession: { findUnique: lookup } } as never);
  const resolve = identityRateLimitSubject(service);
  const request = (token?: string) => ({ header: () => token, params: {}, body: {}, path: '/api/v1/backtests/runs' }) as unknown as PrincipalRequest;
  return { session, service, lookup, resolve, request };
}
beforeEach(() => vi.stubEnv('STRATEGY_IDENTITY_MODE', 'account'));
afterEach(() => vi.unstubAllEnvs());

describe('限流可信主体与单请求身份复用', () => {
  it('用已验证用户标识，不直接把会话或客户端自报标识作为配额主体', async () => {
    const f = setup();
    const token = 'a'.repeat(43), request = f.request(token);
    expect(await f.resolve(request)).toBe(principal.id);
    expect(f.lookup).toHaveBeenCalledWith({ where: { tokenDigest: createHash('sha256').update(token).digest('hex') }, include: { user: true } });
    expect(request.identityPrincipal).toEqual(principal);
    expect(await f.resolve(f.request('b'.repeat(43)))).toBe(principal.id);
    expect(await f.resolve(f.request(principal.id))).toBeUndefined();
    expect(await f.resolve(f.request())).toBeUndefined();
  });
  it.each(['revoked', 'expired', 'disabled', 'missing'])('拒绝 %s 会话的用户配额，原 Guard 继续拒绝访问', async (kind) => {
    const f = setup();
    if (kind === 'revoked') f.session.revokedAt = new Date();
    if (kind === 'expired') f.session.expiresAt = new Date(0);
    if (kind === 'disabled') f.session.user.enabled = false;
    if (kind === 'missing') f.lookup.mockResolvedValue(null as never);
    const request = f.request('a'.repeat(43));
    expect(await f.resolve(request)).toBeUndefined();
    expect(request.identityPrincipal).toBeUndefined();
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
    await expect(new IdentityGuard(f.service).canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(new StrategyIdentityGuard(f.service, {} as never).canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('每个新请求重新核对撤销，不跨请求缓存认证结果', async () => {
    const f = setup(), token = 'a'.repeat(43);
    expect(await f.resolve(f.request(token))).toBe(principal.id);
    f.session.revokedAt = new Date();
    expect(await f.resolve(f.request(token))).toBeUndefined();
    expect(f.lookup).toHaveBeenCalledTimes(2);
  });
  it('同一请求的 Guard 复用验证，策略资源归属仍被检查', async () => {
    const f = setup(), request = f.request('a'.repeat(43));
    await f.resolve(request);
    const id = principal.id;
    request.params = { id };
    Object.defineProperty(request, 'path', { value: `/api/v1/backtests/runs/${id}` });
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
    await expect(new IdentityGuard(f.service).canActivate(context)).resolves.toBe(true);
    const access = { run: vi.fn(), strategy: vi.fn(), version: vi.fn() };
    await expect(new StrategyIdentityGuard(f.service, access as never).canActivate(context)).resolves.toBe(true);
    expect(access.run).toHaveBeenCalledWith(id, principal.id);
    const controller = new IdentityController(f.service);
    expect(await controller.context('a'.repeat(43), request)).toEqual({ mode: 'account', principal });
    expect(await controller.current('a'.repeat(43), request)).toEqual(principal);
    expect(f.lookup).toHaveBeenCalledTimes(1);
  });
  it('本地工作区不查数据库，账户会话入口仍核对真实会话', async () => {
    vi.stubEnv('STRATEGY_IDENTITY_MODE', 'local');
    const f = setup(), request = f.request();
    expect(await f.resolve(request)).toBe('4cb546a5-b04f-4c0a-9d3b-6a53fdb74f57');
    expect(f.lookup).not.toHaveBeenCalled();
    await expect(new IdentityController(f.service).current(undefined, request)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('基础设施错误不当成有效身份或静默降级', async () => {
    const f = setup(), error = new Error('db unavailable');
    f.lookup.mockRejectedValue(error);
    await expect(f.resolve(f.request('a'.repeat(43)))).rejects.toBe(error);
  });
});
