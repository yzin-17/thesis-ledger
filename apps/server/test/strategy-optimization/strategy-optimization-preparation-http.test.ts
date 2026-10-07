import 'reflect-metadata';
import { makeReaderResult } from '../backtest/v3-snapshot-fixtures.js';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { BacktestRunPreparationService } from '../../src/backtest/backtest-run-preparation.service.js';
import { StrategyOptimizationPreparationController } from '../../src/strategy-optimization/strategy-optimization-preparation.controller.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';
import { completeSnapshotFixture } from '../backtest/v3-complete-snapshot-fixtures.js';

describe('实验配置准备HTTP', () => {
  it('已有版本与内存探索种子共用准备能力；不写入任务或返回创建戳', async () => {
    const f = await completeSnapshotFixture();
    f.reader.readV3.mockImplementation(async (input) => {
      const result = await makeReaderResult(input);
      return input.frozenWindowRef && result.status === 'selected'
        ? { ...result, frozenWindowRef: input.frozenWindowRef }
        : result;
    });
    const config = f.input.runConfig;
    const prisma = {
      strategyVersion: {
        findUnique: vi.fn().mockResolvedValue({ schemaVersion: 2, schema: f.input.strategy }),
      },
      backtestJob: { create: vi.fn() },
    };
    const control = {
      getPolicy: vi.fn().mockResolvedValue({
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: 'policy',
        revision: 7,
        enabled: true,
        syncState: 'applied',
        effectiveStale: false,
        routes: [
          {
            key: f.input.executionRouteKey,
            targets: [{ providerId: 'hithink', upstreamSource: 'hithink-financial-api' }],
          },
        ],
      }),
    };
    const preparation = new BacktestRunPreparationService(
      prisma as never,
      f.reader as never,
      control as never,
    );
    @Module({
      controllers: [StrategyOptimizationPreparationController],
      providers: [{ provide: BacktestRunPreparationService, useValue: preparation }],
    })
    class TestModule {}
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    const intent = {
      contractVersion: 3,
      requestId: 'prepare-experiment',
      warmupBudgetSessions: 60,
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
    };
    try {
      const endpoint = `${await app.getUrl()}/strategy-optimization/run-config/prepare`;
      for (const target of [
        { sourceMode: 'existing', strategyVersionId: '11111111-1111-4111-8111-111111111111' },
        {
          sourceMode: 'discovery',
          discoveryScope: {
            executionInstrument: f.input.strategy.executionInstrument,
            primaryTimeframe: '1d',
          },
        },
      ]) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ target, intent }),
        });
        expect(response.status).toBe(201);
        const result = await response.json();
        expect(result).toMatchObject({
          status: 'prepared',
          scope: 'baseline-window',
          requestId: intent.requestId,
          runConfig: {
            frozenWarmupBudgetSessions: 60,
            frozenExecutionWindow: { version: 'market-frozen-window-v1' },
          },
        });
        expect(result).not.toHaveProperty('executionPreflight');
        expect(result).not.toHaveProperty('preparationStamp');
        expect(result.strategyContentHash).toMatch(/^[a-f0-9]{64}$/);
      }
      expect(prisma.strategyVersion.findUnique).toHaveBeenCalledOnce();
      expect(f.reader.readV3.mock.calls.filter(([input]) => input.frozenWindowRef)).toHaveLength(2);
      expect(prisma.backtestJob.create).not.toHaveBeenCalled();
      const invalid = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target: {
            sourceMode: 'existing',
            strategyVersionId: '11111111-1111-4111-8111-111111111111',
          },
          intent: { ...intent, executionPriceProtocol: {} },
        }),
      });
      expect(invalid.status).toBe(400);
    } finally {
      await app.close();
    }
  });
});
