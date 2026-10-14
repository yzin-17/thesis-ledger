import type { ExecutionContext } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrategyIdentityGuard } from '../../src/backtest/strategy-identity.guard.js';

const id = '11111111-1111-4111-8111-111111111111';
function setup(path: string, body: unknown = {}, token?: string) {
  const identities = { requireSession: vi.fn().mockResolvedValue({ id: 'owner' }) };
  const access = { strategy: vi.fn(), version: vi.fn(), run: vi.fn() };
  const request = {
    path,
    params: { id },
    body,
    header: () => token,
    strategyOwnerId: undefined as string | null | undefined,
  };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
  const guard = new StrategyIdentityGuard(identities as never, access as never);
  return { identities, access, request, context, guard };
}

describe('策略 HTTP 身份边界', () => {
  beforeEach(() => vi.stubEnv('STRATEGY_IDENTITY_MODE', 'account'));
  afterEach(() => vi.unstubAllEnvs());
  it('历史公开策略允许匿名读取；私有策略由访问服务拒绝', async () => {
    const fixture = setup(`/api/v1/backtests/strategies/${id}`);
    await expect(fixture.guard.canActivate(fixture.context)).resolves.toBe(true);
    expect(fixture.access.strategy).toHaveBeenCalledWith(id, null);
    expect(fixture.identities.requireSession).not.toHaveBeenCalled();
    fixture.access.strategy.mockRejectedValueOnce(new NotFoundException());
    await expect(fixture.guard.canActivate(fixture.context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it('版本创建和回测输入检查实际会话归属', async () => {
    const fixture = setup(
      `/api/v1/backtests/strategies/${id}/versions`,
      { strategyVersionId: id },
      'opaque-session',
    );
    await fixture.guard.canActivate(fixture.context);
    expect(fixture.access.strategy).toHaveBeenCalledWith(id, 'owner');
    expect(fixture.access.version).toHaveBeenCalledWith(id, 'owner');
    expect(fixture.request.strategyOwnerId).toBe('owner');
  });
  it('读取、重试和取消回测都检查运行归属', async () => {
    for (const action of ['', '/retry', '/cancel', '/run']) {
      const fixture = setup(`/api/v1/backtests/runs/${id}${action}`, {}, 'opaque-session');
      await fixture.guard.canActivate(fixture.context);
      expect(fixture.access.run).toHaveBeenCalledWith(id, 'owner');
    }
  });
  it('已撤销会话拒绝，不能降级为匿名读取', async () => {
    const fixture = setup(`/api/v1/backtests/strategies/${id}`, {}, 'revoked');
    fixture.identities.requireSession.mockRejectedValueOnce(new Error('会话无效'));
    await expect(fixture.guard.canActivate(fixture.context)).rejects.toThrow('会话无效');
    expect(fixture.access.strategy).not.toHaveBeenCalled();
  });
  it('不合法版本标识在访问数据库前拒绝', async () => {
    const fixture = setup('/api/v1/backtests/runs', { strategyVersionId: 'invalid' });
    await expect(fixture.guard.canActivate(fixture.context)).rejects.toThrow();
    expect(fixture.access.version).not.toHaveBeenCalled();
  });
});
