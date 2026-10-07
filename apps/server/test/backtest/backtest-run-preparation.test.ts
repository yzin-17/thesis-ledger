import 'reflect-metadata';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import {
  backtestRunPreparationRequestV3Schema,
  backtestRunPreparationResultV3Schema,
} from '@thesis-ledger/schemas';
import { BacktestRunPreparationService } from '../../src/backtest/backtest-run-preparation.service.js';
import { BacktestRunPreparationController } from '../../src/backtest/backtest-run-preparation.controller.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';

const fixture = async () => {
  const { input, reader } = await completeSnapshotFixture();
  const config = input.runConfig;
  const request = backtestRunPreparationRequestV3Schema.parse({
    contractVersion: 3,
    requestId: 'prepare-test',
    strategyVersionId: '11111111-1111-4111-8111-111111111111',
    adjustment: 'qfq',
    accountingBasis: 'normalized-series',
    history: { basis: 'fixed-provider-snapshot' },
    runConfig: {
      startDate: config.startDate,
      endDate: config.endDate,
      dataAsOf: config.dataAsOf,
      baseCurrency: config.baseCurrency,
      initialCash: config.initialCash,
      valuationPolicy: config.valuationPolicy,
      executionModel: config.executionModel,
    },
  });
  const prisma = {
    strategyVersion: {
      findUnique: vi.fn(async () => ({ schemaVersion: 2, schema: input.strategy })),
    },
    backtestJob: { create: vi.fn() },
  };
  const policy = {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: 'policy',
    revision: 7,
    enabled: true,
    syncState: 'applied',
    effectiveStale: false,
    routes: [
      {
        key: input.executionRouteKey,
        targets: [{ providerId: 'hithink', upstreamSource: 'hithink-financial-api' }],
      },
    ],
  };
  const control = { getPolicy: vi.fn(async () => policy) };
  const service = new BacktestRunPreparationService(
    prisma as never,
    reader as never,
    control as never,
  );
  return { input, reader, request, prisma, policy, control, service };
};

describe('V3运行配置准备', () => {
  it('固定来源缺日输入仍可准备，并保留稀疏窗口身份', async () => {
    const f = await fixture();
    f.reader.readV3.mockImplementation((input) => makeReaderResult(input, false, ['2026-05-19']));
    const result = await f.service.prepare(f.request);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.executionPreflight.status).toBe('ready');
    expect(f.reader.readV3).toHaveBeenCalledWith(expect.objectContaining({
      tradabilityMode: 'assume-untradable-no-bar', priceResearch: true,
    }));
    expect(f.prisma.backtestJob.create).not.toHaveBeenCalled();
  });
  it('内存草稿准备不查询或写入策略版本，也不泄漏Run创建戳', async () => {
    const f = await fixture();
    const { strategyVersionId, ...intent } = f.request;
    const result = await f.service.prepareDraft(intent, f.input.strategy);
    expect(result.status).toBe('prepared');
    expect(result).not.toHaveProperty('executionPreflight');
    expect(result).not.toHaveProperty('preparationStamp');
    expect(result).not.toHaveProperty('strategyVersionId', strategyVersionId);
    expect(result).toHaveProperty('strategyContentHash', hashCanonicalManifest(f.input.strategy));
    expect(f.prisma.strategyVersion.findUnique).not.toHaveBeenCalled();
    expect(f.prisma.backtestJob.create).not.toHaveBeenCalled();
  });
  it('从实际来源生成严格配置、信号绑定与revision，一次取价且不创建Run', async () => {
    const f = await fixture();
    const result = await f.service.prepare(f.request);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.runConfig.executionPriceProtocol).toEqual(
      f.input.runConfig.executionPriceProtocol,
    );
    expect(result.runConfig.executionModel).toEqual(f.request.runConfig.executionModel);
    expect(result.runConfig.priceInputBindings).toEqual(f.input.runConfig.priceInputBindings);
    expect(result.actualSource.provenance.providerId).toBe('hithink');
    expect(result.executionPreflight).toMatchObject({
      status: 'ready',
      revisionStamp: {
        strategyVersionId: f.request.strategyVersionId,
        strategyContentHash: hashCanonicalManifest(f.input.strategy),
        runConfigChecksum: hashCanonicalManifest(result.runConfig),
        desiredRevision: 7,
        effectiveRevision: 1,
        catalogRevision: 12,
      },
    });
    expect(f.reader.readV3).toHaveBeenCalledOnce();
    expect(f.reader.readV3).toHaveBeenCalledWith(
      expect.objectContaining({
        warmup: { analysisStart: f.request.runConfig.startDate, minimumSessions: 5 },
      }),
    );
    expect(f.prisma.backtestJob.create).not.toHaveBeenCalled();
  });

  it('实际来源事实与保存的证据不一致时拒绝准备配置', async () => {
    const f = await fixture();
    f.reader.readV3.mockImplementation(async (readInput) => {
      const result = await makeReaderResult(readInput);
      if (result.status === 'selected')
        result.selection.response.sourcePriceBasis = {
          ...result.selection.response.sourcePriceBasis,
          revision: { origin: 'provider', id: 'changed' },
        };
      return result;
    });
    // Evidence was not updated with the response: this must fail closed rather than forge a protocol.
    await expect(f.service.prepare(f.request)).resolves.toMatchObject({ status: 'blocked' });
  });

  it('旧元数据缺少完整响应哈希时不能生成固定窗口引用', async () => {
    const f = await fixture();
    f.reader.readV3.mockImplementation(async (input) => {
      const result = await makeReaderResult(input);
      if (result.status === 'selected') delete result.evidence.completeResponseHash;
      return result;
    });
    expect(await f.service.prepare(f.request)).toMatchObject({ status: 'blocked' });
    expect(f.prisma.backtestJob.create).not.toHaveBeenCalled();
  });

  it('显式取得后冻结允许首次观察，指定时点仍拒绝晚到事实', async () => {
    const f = await fixture();
    f.request.runConfig.dataAsOf = f.request.runConfig.endDate + 'T23:59:59.000Z';
    const observation = new Date(Date.now() - 1000).toISOString();
    f.reader.readV3.mockImplementation(async (input) => {
      const result = await makeReaderResult(input);
      if (result.status === 'selected') {
        result.selection.response.sourcePriceBasis.observedAt = observation;
        result.evidence.sourcePriceBasis = structuredClone(
          result.selection.response.sourcePriceBasis,
        );
        result.evidence.completeResponseHash = marketFrozenWindowHashV3(result.selection.response);
      }
      return result;
    });
    expect(await f.service.prepare(f.request)).toMatchObject({ status: 'blocked' });
    const acquired = await f.service.prepare({
      ...f.request,
      freezeTimePolicy: 'after-acquisition',
    });
    expect(acquired.status).toBe('prepared');
    if (acquired.status === 'prepared')
      expect(Date.parse(acquired.runConfig.dataAsOf)).toBeGreaterThanOrEqual(
        Date.parse(observation),
      );
  });

  it('取得后冻结也不接受未来观察时间', async () => {
    const f = await fixture();
    f.reader.readV3.mockImplementation(async (input) => {
      const result = await makeReaderResult(input);
      if (result.status === 'selected') {
        result.selection.response.sourcePriceBasis.observedAt = new Date(
          Date.now() + 86400000,
        ).toISOString();
        result.evidence.sourcePriceBasis = structuredClone(
          result.selection.response.sourcePriceBasis,
        );
        result.evidence.completeResponseHash = marketFrozenWindowHashV3(result.selection.response);
      }
      return result;
    });
    expect(
      await f.service.prepare({ ...f.request, freezeTimePolicy: 'after-acquisition' }),
    ).toMatchObject({ status: 'blocked' });
  });

  it('旧模型意图与实际策略标的不符时在取数前拒绝', async () => {
    const f = await fixture();
    f.input.strategy.executionInstrument.symbol = 'other.SZ';
    const result = await f.service.prepare(f.request);
    expect(result.status).toBe('blocked');
    expect(f.reader.readV3).not.toHaveBeenCalled();
  });

  it('来源及证据一致更新时返回新修订事实', async () => {
    const f = await fixture();
    f.reader.readV3.mockImplementation(async (readInput) => {
      const result = await makeReaderResult(readInput);
      if (result.status === 'selected') {
        result.selection.response.sourcePriceBasis.revision = {
          origin: 'provider',
          id: 'new-revision',
        };
        result.evidence.sourcePriceBasis = structuredClone(
          result.selection.response.sourcePriceBasis,
        );
        result.evidence.completeResponseHash = marketFrozenWindowHashV3(result.selection.response);
      }
      return result;
    });
    const result = await f.service.prepare(f.request);
    expect(result).toMatchObject({
      status: 'prepared',
      runConfig: {
        executionPriceProtocol: {
          priceBasis: { revision: { origin: 'provider', id: 'new-revision' } },
        },
      },
    });
  });

  it('来源不支持PIT时不能静默降级为固定快照', async () => {
    const f = await fixture();
    f.request.history = { basis: 'point-in-time', reconstructionEvidenceRef: 'requested-evidence' };
    const result = await f.service.prepare(f.request);
    expect(result).toMatchObject({
      status: 'blocked',
      diagnostics: [{ category: 'point-in-time-unavailable' }],
    });
    expect(result).not.toHaveProperty('runConfig');
  });

  it('Desired在读取期间变化时不能返回prepared', async () => {
    const f = await fixture();
    f.policy.revision = 2;
    const result = await f.service.prepare(f.request);
    expect(result.status).toBe('blocked');
    expect(result).not.toHaveProperty('runConfig');
  });

  it('未应用的路由不读取行情', async () => {
    const f = await fixture();
    f.policy.effectiveStale = true;
    await expect(f.service.prepare(f.request)).resolves.toMatchObject({ status: 'blocked' });
    expect(f.reader.readV3).not.toHaveBeenCalled();
  });

  it('不把缺页和未知来源返回为可提交配置', async () => {
    const f = await fixture();
    f.reader.readV3.mockResolvedValue({
      status: 'unavailable',
      selection: {
        status: 'unavailable',
        reason: 'primary_unavailable',
        primaryFailure: 'missing_window',
      },
    });
    const result = await f.service.prepare(f.request);
    expect(result).toMatchObject({
      status: 'blocked',
      diagnostics: [{ category: 'insufficient-coverage' }],
    });
    expect(result).not.toHaveProperty('runConfig');
  });

  it('固定快照也不允许观察时间超过用户dataAsOf', async () => {
    const f = await fixture();
    f.request.runConfig.dataAsOf = '2026-05-20T00:00:00Z';
    await expect(f.service.prepare(f.request)).resolves.toMatchObject({ status: 'blocked' });
  });

  it('实际HTTP路由可读取prepared合同且不写入任务', async () => {
    const f = await fixture();
    @Module({
      controllers: [BacktestRunPreparationController],
      providers: [{ provide: BacktestRunPreparationService, useValue: f.service }],
    })
    class PreparationHttpModule {}
    const app = await NestFactory.create(PreparationHttpModule, { logger: false });
    app.useGlobalFilters(new ApiExceptionFilter());
    try {
      await app.listen(0, '127.0.0.1');
      const response = await fetch(`${await app.getUrl()}/backtests/run-config/prepare`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(f.request),
      });
      expect(response.status).toBe(201);
      expect(backtestRunPreparationResultV3Schema.parse(await response.json()).status).toBe(
        'prepared',
      );
      expect(f.prisma.backtestJob.create).not.toHaveBeenCalled();
      f.reader.readV3.mockClear();
      const invalid = await fetch(`${await app.getUrl()}/backtests/run-config/prepare`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...f.request,
          runConfig: { ...f.request.runConfig, executionPriceProtocol: {} },
        }),
      });
      expect(invalid.status).toBe(400);
      expect(f.reader.readV3).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
