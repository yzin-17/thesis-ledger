import { describe, expect, it, vi } from 'vitest';
import { BacktestCreationGuardService } from '../../src/backtest/backtest-creation-guard.service.js';
import { preparationStampFor, preparedRevisionReader } from './v3-preparation-fixtures.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { lifecycleCapabilitiesFixture } from '../market/lifecycle-response.fixture.js';
import { deriveLifecyclePreparationV3 } from '../../src/backtest/backtest-lifecycle-preparation-v3.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import { planBacktestPriceInputs } from '../../src/backtest/backtest-dependency-price.js';

describe('创建必须核对影响准备的生命周期版本', () => {
  it('相同输入可创建，已封存及现行来源的基础日期变化必须重新准备', async () => {
    const f = await completeSnapshotFixture();
    const { strategy, runConfig } = f.input;
    strategy.executionInstrument = { market: 'CN', symbol: '000995.SZ', assetType: 'stock' };
    strategy.signalSources.forEach((source) => (source.asset = strategy.executionInstrument));
    runConfig.executionModel!.scope.symbol = '000995.SZ';
    runConfig.executionModel!.scope.instrumentType = 'STOCK';
    const plan = planBacktestPriceInputs(strategy, runConfig);
    const result = await makeReaderResult({
      market: 'CN',
      symbol: '000995.SZ',
      routeKey: { ...f.input.executionRouteKey, assetType: 'STOCK' },
      window: { start: plan.warmup.startDate, end: runConfig.endDate },
    });
    if (result.status !== 'selected') throw new Error('行情不可用');
    runConfig.frozenExecutionWindow = {
      version: 'market-frozen-window-v1',
      identityFingerprint: result.evidence.identityFingerprint,
      responseHash: result.evidence.completeResponseHash!,
    };
    const readLifecycle = (ipoDate: string) => lifecycleCapabilitiesFixture(
      '000995.SZ',
      plan.warmup.startDate,
      runConfig.endDate,
      ipoDate,
    ).read();
    const response = await readLifecycle('2000-01-01');
    runConfig.lifecyclePreparation = deriveLifecyclePreparationV3({
      response,
      bars: result.selection.response.bars,
      start: runConfig.startDate,
      end: runConfig.endDate,
      required: plan.warmup.lookbackPeriods,
      priceResponseHash: runConfig.frozenExecutionWindow.responseHash,
    });
    const request = {
      contractVersion: 1 as const,
      strategyVersionId: '11111111-1111-4111-8111-111111111111',
      runConfig,
      idempotencyKey: 'test',
      preparationStamp: preparationStampFor(
        strategy,
        runConfig,
        '11111111-1111-4111-8111-111111111111',
      ),
    };
    const prisma = {
      strategyVersion: { findUnique: vi.fn(async () => ({ schemaVersion: 1, schema: strategy })) },
    };
    const life = { read: vi.fn(async () => response) };
    const guard = new BacktestCreationGuardService(
      prisma as never,
      preparedRevisionReader() as never,
      undefined,
      life as never,
    );
    await expect(guard.check(request, strategy)).resolves.toBeUndefined();
    const tampered = structuredClone(request);
    tampered.runConfig.lifecyclePreparation!.response.basicLifecycle!.ipoDate = '2000-01-02';
    tampered.preparationStamp = preparationStampFor(strategy, tampered.runConfig, request.strategyVersionId);
    await expect(guard.check(tampered, strategy)).rejects.toThrow();
    life.read.mockResolvedValue(await readLifecycle('2000-01-02'));
    await expect(guard.check(request, strategy)).rejects.toThrow();
  });
});
