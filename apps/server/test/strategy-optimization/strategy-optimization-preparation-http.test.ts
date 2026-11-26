import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { OptimizationPreparation } from '../../src/strategy-optimization/optimization-preparation.js';
import { BacktestRunPreparationService } from '../../src/backtest/backtest-run-preparation.service.js';
import { StrategyOptimizationPreparationController } from '../../src/strategy-optimization/strategy-optimization-preparation.controller.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';
import { priceResearchFixture } from '../backtest/price-research.fixtures.js';
import { OptimizationModelResolution } from '../../src/strategy-optimization/optimization-model-resolution.js';
import { StrategyAccessService } from '../../src/backtest/strategy-access.service.js';
import { StrategyIdentityGuard } from '../../src/backtest/strategy-identity.guard.js';
import { IdentityService } from '../../src/identity/identity.service.js';
import { optimizationRunPreparationResultSchema } from '@thesis-ledger/schemas';

describe('实验配置准备HTTP', () => {
  it('已有版本与内存探索种子共用准备能力；不写入任务或返回创建戳', async () => {
    const f = await priceResearchFixture({ researchSource: { providerId: 'futu', upstreamSource: 'futu' },
      actualSource: { providerId: 'tushare', upstreamSource: 'tushare', routeIndex: 1 } });
    const config = f.input.runConfig;
    const prisma = {
      strategyVersion: {
        findUnique: vi.fn().mockResolvedValue({ schemaVersion: 1, schema: f.input.strategy }),
      },
      backtestJob: { create: vi.fn() },
    };
    const control = f.control;
    const preparation = new BacktestRunPreparationService(
      prisma as never,
      f.reader as never,
      control as never,
    );
    @Module({
      controllers: [StrategyOptimizationPreparationController],
      providers: [OptimizationPreparation, { provide: BacktestRunPreparationService, useValue: preparation },
        { provide: OptimizationModelResolution, useValue: {} }, { provide: StrategyAccessService, useValue: {} },
        { provide: IdentityService, useValue: {} },
        { provide: StrategyIdentityGuard, useValue: { canActivate: () => true } }],
    })
    class TestModule {}
    const app = await NestFactory.create(TestModule, { logger: false, abortOnError: false });
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    const intent = {
      contractVersion: 1,
      requestId: 'prepare-experiment',
      warmupBudgetSessions: 60,
      adjustment: 'hfq',
      priceResearch: 'price-research-v1',
      priceResearchReference: 'freeze',
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
          actualSource: { provenance: { providerId: 'futu', routeIndex: 0 } },
          actualPriceSource: { routeKey: { adjustment: 'none' }, provenance: { providerId: 'tushare', upstreamSource: 'tushare', routeIndex: 1 } },
          runConfig: {
            frozenWarmupBudgetSessions: 60,
            frozenExecutionWindow: { version: 'market-frozen-window-v1' },
            priceResearch: { protocolVersion: 'price-research-v1', actualPriceWindow: { version: 'market-frozen-window-v1' } },
          },
        });
        expect(result).not.toHaveProperty('executionPreflight');
        const legacy = { ...result };
        delete legacy.actualPriceSource;
        expect(optimizationRunPreparationResultSchema.safeParse(legacy).success).toBe(true);
        expect(optimizationRunPreparationResultSchema.safeParse({ ...result, actualPriceSource: {
          ...result.actualPriceSource, routeKey: { ...result.actualPriceSource.routeKey, adjustment: 'hfq' },
        } }).success).toBe(false);
        expect(result).not.toHaveProperty('preparationStamp');
        expect(result.strategyContentHash).toMatch(/^[a-f0-9]{64}$/);
      }
      expect(prisma.strategyVersion.findUnique).toHaveBeenCalledOnce();
      expect(f.reader.readV3.mock.calls.filter(([input]) => input.frozenWindowRef)).toHaveLength(2);
      expect(prisma.backtestJob.create).not.toHaveBeenCalled();
      const selected = f.reader.readV3.getMockImplementation()!;
      f.reader.readV3.mockClear();
      f.reader.readV3.mockImplementation(async (input) => input.routeKey.adjustment === 'none'
        ? { status: 'unavailable', selection: { status: 'unavailable', reason: 'route_not_configured' } } as never
        : selected(input));
      const restricted = await fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: { sourceMode: 'discovery', discoveryScope: {
          executionInstrument: f.input.strategy.executionInstrument, primaryTimeframe: '1d',
        } }, intent: { ...intent, priceResearchReference: 'optional' } }),
      });
      expect(restricted.status).toBe(201);
      const limited = await restricted.json();
      expect(limited).toMatchObject({ status: 'prepared', runConfig: { priceResearch: { dataScope: {
        priceCoordinates: ['research'], sizingModes: ['fixedAmount', 'equityRatio'],
        unavailableCapabilities: [{ capability: 'actual-price', code: 'route_not_configured' }],
      } } } });
      expect(limited.runConfig.priceResearch).not.toHaveProperty('actualPriceWindow');
      expect(f.reader.readV3.mock.calls.filter(([input]) => !input.frozenWindowRef)
        .map(([input]) => input.routeKey.adjustment)).toEqual(['hfq', 'none']);
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
