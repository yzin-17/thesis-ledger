import 'reflect-metadata';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { backtestNavPreparationResultV3Schema } from '@thesis-ledger/schemas';
import { BacktestNavPreparationController } from '../../src/backtest/backtest-nav-preparation.controller.js';
import { BacktestNavPreparationRepository } from '../../src/backtest/backtest-nav-preparation-repository.js';
import {
  BacktestNavPreparationService,
  NAV_PREPARATION_TIMEOUT_MS,
} from '../../src/backtest/backtest-nav-preparation.service.js';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';
import { MarketNavReaderV3 } from '../../src/market/market-nav-reader-v3.js';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';
import {
  DsaV3ProtocolError,
  type DsaV3ErrorCode,
} from '../../src/integration/dsa/dsa-v3-protocol.js';
import {
  SnapshotIntegrityError,
  hashCanonicalManifest,
} from '../../src/backtest/backtest-snapshot.js';
import { navPreparationFixture } from './nav-preparation.fixtures.js';

describe('NAV 准备服务与实际 HTTP', () => {
  let app: INestApplication;
  let endpoint: string;
  let f: ReturnType<typeof navPreparationFixture>;
  const findUnique = vi.fn();
  const write = vi.fn();
  const persistPreparation = vi.fn();
  const prisma = {
    strategyVersion: { findUnique },
    backtestRun: { create: write },
    backtestJob: { create: write },
    navBacktestPreparation: { create: persistPreparation },
  };
  const reader = { read: (input: Parameters<MarketNavReaderV3['read']>[0]) => f.read(input) };

  beforeAll(async () => {
    @Module({
      controllers: [BacktestNavPreparationController],
      providers: [
        BacktestNavPreparationService,
        BacktestNavPreparationRepository,
        { provide: PrismaService, useValue: prisma },
        { provide: MarketNavReaderV3, useValue: reader },
        { provide: NAV_PREPARATION_TIMEOUT_MS, useValue: 120000 },
      ],
    })
    class TestModule {}
    app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalFilters(new ApiExceptionFilter());
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    endpoint = `${await app.getUrl()}/api/v1/backtests/run-config/nav/prepare`;
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-10-01T00:00:00Z');
    f = navPreparationFixture();
    findUnique
      .mockReset()
      .mockImplementation(async () => ({ schemaVersion: 2, schema: f.strategy }));
    write.mockReset();
    persistPreparation.mockReset().mockImplementation(async ({ data }) => data);
  });
  afterEach(() => {
    expect(write).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  afterAll(async () => {
    await app.close();
  });
  async function post(body: unknown = f.request) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  it('实际模块注入持久保存证据后返回专属合同与创建引用，不暴露原文', async () => {
    const result = await post();
    expect(result.status).toBe(200);
    const parsed = backtestNavPreparationResultV3Schema.parse(result.body);
    expect(parsed.status).toBe('prepared');
    if (parsed.status !== 'prepared') throw new Error('预期准备成功');
    expect(parsed.binding.strategyContentHash).toBe(hashCanonicalManifest(f.strategy));
    expect(parsed.receipt).toMatchObject({ preparationHash: parsed.binding.preparationHash });
    expect(persistPreparation).toHaveBeenCalledTimes(1);
    expect(persistPreparation.mock.calls[0]![0].data.evidence.context.responseRaw).toBe(
      f.source.response.responseRaw,
    );
    expect(parsed.binding.runConfigChecksum).toBe(hashCanonicalManifest(parsed.runConfig));
    expect(parsed.inputPlanSummary.priceInputs.map((item) => item.purpose)).toEqual([
      'execution',
      'signal',
      'benchmark',
    ]);
    expect(parsed.runConfig.dataAsOf).toBe(parsed.checkedAt);
    expect(parsed.actualSource.routeTarget).toEqual(f.source.request.routeTarget);
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(f.read.mock.calls[0]![0].dataAsOf).toBe('2026-10-01T00:02:00.000Z');
    for (const key of [
      'context',
      'selection',
      'facts',
      'responseRaw',
      'preparationStamp',
      'preparationRef',
    ])
      expect(result.body).not.toHaveProperty(key);
    expect(JSON.stringify(result.body)).not.toContain('nativeRecordRaw');
  });
  it('内部入口保留全部原文及完整计划，供后续创建编排保管', async () => {
    const result = await app.get(BacktestNavPreparationService).prepareEvidence(f.request);
    expect(result.status).toBe('prepared');
    if (result.status !== 'prepared') throw new Error('预期准备成功');
    expect(result.context.responseRaw).toBe(f.source.response.responseRaw);
    expect(result.facts).toEqual(f.source.response.facts);
    expect(result.plan.priceInputs).toHaveLength(3);
    expect(result.binding.inputPlanHash).toBe(hashCanonicalManifest(result.plan));
  });
  it.each(['bad-id', 'caller-time', 'forged-binding', 'model-symbol', 'strict-mode'])(
    '非法请求 %s 在读库前返回 400',
    async (mode) => {
      const body: Record<string, unknown> = structuredClone(f.request);
      if (mode === 'bad-id') body.strategyVersionId = 'invalid';
      if (mode === 'caller-time')
        body.runConfig = { ...f.request.runConfig, dataAsOf: '2026-10-01T00:00:00Z' };
      if (mode === 'forged-binding') body.binding = { preparationHash: 'a'.repeat(64) };
      if (mode === 'model-symbol') {
        const model = structuredClone(f.request.runConfig.executionModel);
        model.scope.symbol = '000001.OF';
        body.runConfig = { ...f.request.runConfig, executionModel: model };
      }
      if (mode === 'strict-mode') body.visibilityMode = 'strict-publication';
      expect((await post(body)).status).toBe(400);
      expect(findUnique).not.toHaveBeenCalled();
      expect(f.read).not.toHaveBeenCalled();
    },
  );
  it('版本不存在返回 404', async () => {
    findUnique.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect(f.read).not.toHaveBeenCalled();
  });
  it.each(['schema-version', 'schema-body'])('存储策略 %s 无效返回 422', async (mode) => {
    findUnique.mockResolvedValue({
      schemaVersion: mode === 'schema-version' ? 1 : 2,
      schema: mode === 'schema-body' ? {} : f.strategy,
    });
    expect((await post()).status).toBe(422);
    expect(f.read).not.toHaveBeenCalled();
  });
  it.each(['changed', 'deleted', 'invalid'])('采集期间版本 %s 阻断', async (mode) => {
    findUnique.mockResolvedValueOnce({ schemaVersion: 2, schema: f.strategy });
    findUnique.mockResolvedValueOnce(
      mode === 'deleted'
        ? null
        : {
            schemaVersion: 2,
            schema: mode === 'invalid' ? {} : { ...f.strategy, name: '已变化的版本' },
          },
    );
    const result = await post();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      status: 'blocked',
      diagnostics: [{ code: 'PREPARATION_STALE' }],
    });
    expect(f.read).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['timeout', 'SOURCE_TIMEOUT'],
    ['unavailable', 'SOURCE_UNAVAILABLE'],
    ['unauthorized', 'SOURCE_UNAUTHORIZED'],
    ['invalid-response', 'SOURCE_INVALID_RESPONSE'],
    ['unsupported-capability', 'SOURCE_UNSUPPORTED'],
    ['insufficient-coverage', 'DATA_UNAVAILABLE'],
    ['control-rejected', 'SOURCE_NOT_ADMITTED'],
    ['stale-revision', 'PREPARATION_STALE'],
  ] as const)('来源 %s 映射稳定诊断，隐藏上游细节', async (code: DsaV3ErrorCode, expected) => {
    f.read.mockRejectedValueOnce(new DsaV3ProtocolError('私有来源内容 probe-secret', code));
    const result = await post();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'blocked', diagnostics: [{ code: expected }] });
    expect(JSON.stringify(result.body)).not.toContain('probe-secret');
  });
  it('Control 的现行 DsaError 同样映射稳定诊断', async () => {
    f.read.mockRejectedValueOnce(new DsaError('private', 'unauthorized'));
    expect((await post()).body).toMatchObject({
      status: 'blocked',
      diagnostics: [{ code: 'SOURCE_UNAUTHORIZED' }],
    });
  });
  it('原文完整性失败阻断，不返回成功配置', async () => {
    f.read.mockRejectedValueOnce(new SnapshotIntegrityError('private evidence'));
    expect((await post()).body).toMatchObject({
      status: 'blocked',
      diagnostics: [{ code: 'SOURCE_INVALID_RESPONSE' }],
    });
  });
  it('不完整日期预算阻断', async () => {
    f.source.response.calendar.tradingDates.pop();
    expect((await post()).body).toMatchObject({
      status: 'blocked',
      diagnostics: [{ code: 'DATA_UNAVAILABLE' }],
    });
  });
  it.each(['read', 'database-before', 'database-after', 'receipt-write'])(
    '未知 %s 错误保留 500，持久化失败不返回创建引用',
    async (mode) => {
      if (mode === 'read') f.read.mockRejectedValueOnce(new Error('unexpected probe-secret'));
      if (mode === 'database-before')
        findUnique.mockRejectedValueOnce(new Error('database probe-secret'));
      if (mode === 'database-after') {
        findUnique.mockResolvedValueOnce({ schemaVersion: 2, schema: f.strategy });
        findUnique.mockRejectedValueOnce(new Error('database probe-secret'));
      }
      if (mode === 'receipt-write')
        persistPreparation.mockRejectedValueOnce(new Error('database probe-secret'));
      const result = await post();
      expect(result.status).toBe(500);
      expect(result.body).not.toHaveProperty('status', 'blocked');
      expect(JSON.stringify(result.body)).not.toContain('probe-secret');
      expect(result.body).not.toHaveProperty('receipt');
    },
  );
});
