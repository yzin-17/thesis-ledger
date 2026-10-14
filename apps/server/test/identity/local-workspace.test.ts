import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import { UnauthorizedException } from '@nestjs/common';
import { IdentityController } from '../../src/identity/identity.controller.js';
import { IdentityGuard } from '../../src/identity/identity.guard.js';
import { StrategyIdentityGuard } from '../../src/backtest/strategy-identity.guard.js';
import { BacktestController } from '../../src/backtest/backtest.controller.js';

afterEach(() => vi.unstubAllEnvs());
const context = (request: object) => ({ switchToHttp: () => ({ getRequest: () => request }) });

describe('本地工作区无会话访问', () => {
  it('默认上下文和草稿、策略使用同一稳定归属，不访问账号或会话', async () => {
    vi.stubEnv('STRATEGY_IDENTITY_MODE', undefined);
    const identities = { requireSession: vi.fn() };
    const controller = new IdentityController(identities as never);
    const first = await controller.context(undefined);
    expect(first.mode).toBe('local');
    expect(first.principal).toBeTruthy();
    expect(await controller.context('旧会话')).toEqual(first);
    const draft = { header: () => undefined, identityPrincipal: undefined as unknown };
    await new IdentityGuard(identities as never).canActivate(context(draft) as never);
    expect(draft.identityPrincipal).toEqual(first.principal);
    const strategy = {
      header: () => undefined,
      path: '/backtests/strategies',
      params: {},
      body: {},
      strategyOwnerId: undefined as unknown,
    };
    await new StrategyIdentityGuard(identities as never, {} as never).canActivate(
      context(strategy) as never,
    );
    expect(strategy.strategyOwnerId).toBe(first.principal!.id);
    expect(identities.requireSession).not.toHaveBeenCalled();
  });

  it('本地事件订阅没有会话也能接收心跳和可访问任务事件', async () => {
    vi.stubEnv('STRATEGY_IDENTITY_MODE', 'local');
    const owner = (await new IdentityController({} as never).context(undefined)).principal!.id;
    const event = { type: 'succeeded', data: { id: 'run' } };
    const identities = { requireSession: vi.fn() };
    const access = { canReadRun: vi.fn().mockResolvedValue(true) };
    const controller = new BacktestController(
      {} as never,
      { stream: () => of(event) } as never,
      access as never,
      identities as never,
    );
    expect(await firstValueFrom(controller.events(owner))).toEqual(event);
    expect(access.canReadRun).toHaveBeenCalledWith('run', owner);
    expect(identities.requireSession).not.toHaveBeenCalled();
  });

  it('明确账号模式仍要求有效会话', async () => {
    vi.stubEnv('STRATEGY_IDENTITY_MODE', 'account');
    const identities = { requireSession: vi.fn().mockRejectedValue(new Error('会话无效')) };
    const controller = new IdentityController(identities as never);
    expect(await controller.context(undefined)).toEqual({ mode: 'account', principal: null });
    const request = { header: () => undefined };
    await expect(
      new IdentityGuard(identities as never).canActivate(context(request) as never),
    ).rejects.toThrow('会话无效');
    expect(identities.requireSession).toHaveBeenCalledWith(undefined);
  });

  it('账号上下文失效时不返回归属，客户端仍可重新登录', async () => {
    vi.stubEnv('STRATEGY_IDENTITY_MODE', 'account');
    const identities = { requireSession: vi.fn().mockRejectedValue(new UnauthorizedException()) };
    expect(await new IdentityController(identities as never).context('revoked')).toEqual({
      mode: 'account',
      principal: null,
    });
    await expect(
      new IdentityGuard(identities as never).canActivate(
        context({ header: () => 'revoked' }) as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
