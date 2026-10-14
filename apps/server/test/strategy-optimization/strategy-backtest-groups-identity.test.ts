import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IdentityService } from '../../src/identity/identity.service.js';
import { IdentityModule } from '../../src/identity/identity.module.js';
import { StrategyAccessService } from '../../src/backtest/strategy-access.service.js';
import { BacktestModule } from '../../src/backtest/backtest.module.js';
import { StrategyOptimizationModule } from '../../src/strategy-optimization/strategy-optimization.module.js';
import { StrategyIdentityGuard } from '../../src/backtest/strategy-identity.guard.js';
import { StrategyOptimizationController } from '../../src/strategy-optimization/strategy-optimization.controller.js';
import { StrategyOptimizationReadService } from '../../src/strategy-optimization/strategy-optimization-read.service.js';

const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';

@Module({
  providers: [
    { provide: IdentityService, useValue: { requireSession: async () => ({ id: alice }) } },
  ],
  exports: [IdentityService],
})
class IdentityFixtureModule {}
@Module({
  providers: [{ provide: StrategyAccessService, useValue: {} }],
  exports: [StrategyAccessService],
})
class BacktestAccessFixtureModule {}
@Module({
  imports: [IdentityFixtureModule, BacktestAccessFixtureModule],
  providers: [StrategyIdentityGuard],
})
class GuardConsumerFixtureModule {}

describe('回测分组所属用户边界', () => {
  beforeEach(() => vi.stubEnv('STRATEGY_IDENTITY_MODE', 'account'));
  afterEach(() => vi.unstubAllEnvs());
  it('消费层声明身份模块并注册守卫，回测模块导出所属用户服务；Nest 能解析守卫依赖', async () => {
    expect(Reflect.getMetadata('imports', StrategyOptimizationModule)).toContain(IdentityModule);
    expect(Reflect.getMetadata('providers', StrategyOptimizationModule)).toContain(
      StrategyIdentityGuard,
    );
    expect(Reflect.getMetadata('exports', BacktestModule)).toContain(StrategyAccessService);
    const app = await NestFactory.createApplicationContext(GuardConsumerFixtureModule, {
      logger: false,
    });
    try {
      const request = {
        path: '/strategy-optimization/backtests/groups',
        params: {},
        header: () => 'fixture-session',
        strategyOwnerId: undefined as string | null | undefined,
      };
      await app
        .get(StrategyIdentityGuard)
        .canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never);
      expect(request.strategyOwnerId).toBe(alice);
    } finally {
      await app.close();
    }
  });
  it.each([null, alice, bob])('普通及精确分组查询始终附加会话所属用户过滤：%s', async (ownerId) => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      backtestJob: { findMany },
      strategyVersion: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const reads = new StrategyOptimizationReadService(
      prisma as never,
      { list: () => [] } as never,
      { protectBacktestJobs: async (jobs: unknown) => jobs } as never,
    );
    const controller = new StrategyOptimizationController(
      {} as never,
      reads,
      {} as never,
      {} as never,
    );
    expect(Reflect.getMetadata('__guards__', controller.listBacktestGroups)).toContain(
      StrategyIdentityGuard,
    );
    const request = {
      path: '/strategy-optimization/backtests/groups',
      params: {},
      header: () => (ownerId ? 'fixture-session' : undefined),
      strategyOwnerId: undefined as string | null | undefined,
    };
    const guard = new StrategyIdentityGuard(
      { requireSession: async () => ({ id: ownerId }) } as never,
      {} as never,
    );
    await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never);
    await controller.listBacktestGroups(
      { limit: 1, jobId: bob, ownerId: bob },
      request.strategyOwnerId!,
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: bob,
          strategyVersion: {
            strategy: { OR: [{ ownerId: null }, ...(ownerId ? [{ ownerId }] : [])] },
          },
        }),
      }),
    );
  });
});
