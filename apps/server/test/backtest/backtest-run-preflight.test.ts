import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { backtestPreflightResultV3Schema } from '@thesis-ledger/schemas';
import { BacktestCreationGuardService } from '../../src/backtest/backtest-creation-guard.service.js';
import { BacktestRunPreflightController } from '../../src/backtest/backtest-run-preflight.controller.js';
import { BacktestRunPreflightService } from '../../src/backtest/backtest-run-preflight.service.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { preparationStampFor, preparedRevisionReader } from './v3-preparation-fixtures.js';
import { planBacktestPriceInputs } from '../../src/backtest/backtest-dependency-price.js';
import { sharedStrategyHttpProviders } from './shared-strategy-http-providers.js';

async function fixture() {
  const h = await completeSnapshotFixture();
  const prisma = {
    strategyVersion: {
      findUnique: vi.fn(async () => ({
        schemaVersion: 2,
        schema: structuredClone(h.input.strategy),
      })),
    },
    backtestJob: { create: vi.fn() },
  };
  const revisions = preparedRevisionReader();
  const guard = new BacktestCreationGuardService(prisma as never, revisions as never);
  const service = new BacktestRunPreflightService(
    prisma as never,
    h.reader as never,
    revisions as never,
    h.dsa as never,
    guard,
  );
  return {
    ...h,
    prisma,
    revisions,
    service,
    request: {
      contractVersion: 3,
      requestId: 'preflight-test',
      strategyVersionId: '11111111-1111-4111-8111-111111111111',
      runConfig: h.input.runConfig,
    },
  };
}

describe('公告创建准备检查', () => {
  it('直接创建在快照冻结前拒绝未完成公告准备，不落失败回测', async () => {
    const h = await fixture();
    const { strategy, runConfig } = h.input;
    const progress = { status: 'preparing', jobIds: ['a'.repeat(64)], total: 1, completed: 0,
      failed: 0, matched: 0, downloaded: 0, parsed: 0, errors: [] };
    const guard = new BacktestCreationGuardService(h.prisma as never, h.revisions as never,
      { prepare: vi.fn(async () => progress) } as never);
    await expect(guard.check({ contractVersion: 3, strategyVersionId: h.request.strategyVersionId,
      runConfig, preparationStamp: preparationStampFor(strategy, runConfig, h.request.strategyVersionId),
      idempotencyKey: 'announcement-pending' }, strategy)).rejects.toMatchObject({
        response: { code: 'ANNOUNCEMENT_DATA_PREPARING' },
      });
    expect(h.prisma.backtestJob.create).not.toHaveBeenCalled();
  });
});

describe('联合运行预检', () => {
  it('现金研究创建守卫使用准备阶段的交易日预热范围，旧协议仍保留缓冲', async () => {
    const h = await fixture();
    const { strategy, runConfig } = h.input;
    const legacy = planBacktestPriceInputs(strategy, runConfig);
    runConfig.executionPriceProtocol.cashEventResearch = 'ex-date-entitlement-payment-date-cash-v1';
    const plan = planBacktestPriceInputs(strategy, runConfig, {
      cashEventResearch: runConfig.executionPriceProtocol.cashEventResearch,
    });
    expect(Date.parse(plan.warmup.startDate) - Date.parse(legacy.warmup.startDate)).toBe(
      14 * 86_400_000,
    );
    const strategyVersionId = h.request.strategyVersionId;
    const stamp = preparationStampFor(strategy, runConfig, strategyVersionId);
    stamp.targetSequences[0]!.requirement.dateRange.startDate = plan.warmup.startDate;
    const guard = new BacktestCreationGuardService(h.prisma as never, h.revisions as never);
    await expect(
      guard.check(
        {
          contractVersion: 3,
          strategyVersionId,
          runConfig,
          preparationStamp: stamp,
          idempotencyKey: 'cash-research-creation',
        },
        strategy,
      ),
    ).resolves.toBeUndefined();
    stamp.targetSequences[0]!.requirement.dateRange.startDate = legacy.warmup.startDate;
    await expect(
      guard.check(
        {
          contractVersion: 3,
          strategyVersionId,
          runConfig,
          preparationStamp: stamp,
          idempotencyKey: 'stale-cash-research-creation',
        },
        strategy,
      ),
    ).rejects.toMatchObject({ response: { code: 'PREPARATION_STALE' } });
  });

  it('NAV 创建守卫在查库和读取 ETF 路由前拒绝', async () => {
    const prisma = { strategyVersion: { findUnique: vi.fn() } };
    const revisions = { readCurrent: vi.fn() };
    const guard = new BacktestCreationGuardService(prisma as never, revisions as never);
    await expect(
      guard.check(
        {} as never,
        {
          executionInstrument: { assetType: 'fund' },
          execution: { mode: 'nav' },
          primaryTimeframe: '1d',
        } as never,
      ),
    ).rejects.toMatchObject({ response: { code: 'PREPARATION_STALE' } });
    expect(prisma.strategyVersion.findUnique).not.toHaveBeenCalled();
    expect(revisions.readCurrent).not.toHaveBeenCalled();
  });

  it('检查执行行情和实际依赖，返回前重新核对策略和路由', async () => {
    const h = await fixture();
    expect(await h.service.check(h.request)).toMatchObject({ status: 'ready' });
    expect(h.reader.readV3).toHaveBeenCalledTimes(1);
    expect(h.dsa.backtestCalendar).toHaveBeenCalledTimes(1);
    expect(h.dsa.backtestInstrumentFacts).toHaveBeenCalledTimes(1);
    expect(h.revisions.readCurrent).toHaveBeenCalledTimes(2);
    expect(h.prisma.strategyVersion.findUnique).toHaveBeenCalledTimes(2);
    expect(h.prisma.backtestJob.create).not.toHaveBeenCalled();
  });

  it('行情可用而非价格依赖缺失时不能返回就绪', async () => {
    const h = await fixture();
    h.dsa.backtestCalendar.mockRejectedValue(new Error('private-provider-detail'));
    const result = await h.service.check(h.request);
    expect(result).toMatchObject({ status: 'blocked', diagnostics: [{ purpose: 'calendar' }] });
    expect(JSON.stringify(result)).not.toContain('private-provider-detail');
  });

  it.each(['strategy', 'route'] as const)('检查期间%s变化会使结果失效', async (kind) => {
    const h = await fixture();
    const read = h.dsa.backtestCalendar.getMockImplementation()!;
    h.dsa.backtestCalendar.mockImplementation(async (request) => {
      if (kind === 'strategy') h.input.strategy.name = '检查期间修改';
      else
        h.revisions.readCurrent.mockResolvedValue({
          ...(await h.revisions.readCurrent()),
          catalogRevision: 999,
        });
      return read(request);
    });
    expect(await h.service.check(h.request)).toMatchObject({
      status: 'blocked',
      diagnostics: [{ missingFields: ['currentPreparationRevision'] }],
    });
  });

  it('控制面不可用时不读取行情或非价格依赖', async () => {
    const h = await fixture();
    h.revisions.readCurrent.mockRejectedValue(new Error('offline'));
    expect(await h.service.check(h.request)).toMatchObject({ status: 'blocked' });
    expect(h.reader.readV3).not.toHaveBeenCalled();
    expect(h.dsa.backtestCalendar).not.toHaveBeenCalled();
  });

  it('不支持的价格绑定在读取前返回输入诊断', async () => {
    const h = await fixture();
    delete h.request.runConfig.priceInputBindings;
    expect(await h.service.check(h.request)).toMatchObject({
      status: 'invalid-input',
      revisionStamp: null,
    });
    expect(h.reader.readV3).not.toHaveBeenCalled();
    expect(h.revisions.readCurrent).not.toHaveBeenCalled();
  });

  it('实际HTTP接口返回可解析合同并拒绝额外字段', async () => {
    const h = await fixture();
    @Module({
      controllers: [BacktestRunPreflightController],
      providers: [
        ...sharedStrategyHttpProviders,
        { provide: BacktestRunPreflightService, useValue: h.service },
      ],
    })
    class TestModule {}
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalFilters(new ApiExceptionFilter());
    try {
      await app.listen(0, '127.0.0.1');
      const url = `${await app.getUrl()}/backtests/run-config/preflight`;
      const post = (body: unknown) =>
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      const response = await post(h.request);
      expect(response.status).toBe(201);
      expect(backtestPreflightResultV3Schema.parse(await response.json()).status).toBe('ready');
      expect((await post({ ...h.request, extra: true })).status).toBe(400);
      expect(h.prisma.backtestJob.create).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
