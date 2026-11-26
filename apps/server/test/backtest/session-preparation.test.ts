import { expect, it, vi } from 'vitest';
import { backtestRunPreparationRequestV3Schema } from '@thesis-ledger/schemas';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { BacktestConfiguredRunService } from '../../src/backtest/backtest-configured-run.service.js';
import { BacktestCreationGuardService } from '../../src/backtest/backtest-creation-guard.service.js';
import { BacktestRunPreflightService } from '../../src/backtest/backtest-run-preflight.service.js';
import { sessionVwapInput } from './session-vwap-snapshot.fixture.js';
import { preparedRevisionReader } from './v3-preparation-fixtures.js';

it('正式准备入口选择分钟路由和显式观察模式，不创建任务或启用来源', async () => {
  const { input, reader } = await sessionVwapInput();
  const config = input.runConfig;
  const request = backtestRunPreparationRequestV3Schema.parse({
    contractVersion: 1, requestId: 'minute-preparation',
    strategyVersionId: '11111111-1111-4111-8111-111111111111',
    adjustment: 'qfq', accountingBasis: 'normalized-series', history: { basis: 'fixed-provider-snapshot' },
    runConfig: { startDate: config.startDate, endDate: config.endDate, dataAsOf: config.dataAsOf,
      baseCurrency: config.baseCurrency, initialCash: config.initialCash,
      valuationPolicy: config.valuationPolicy, executionModel: config.executionModel },
  });
  const control = { getPolicy: vi.fn(async () => ({ contractVersion: 1, consumer: 'thesis-ledger',
    requestId: 'policy', revision: 7, enabled: true, syncState: 'applied', effectiveStale: false,
    routes: [{ key: input.executionRouteKey, targets: [{ providerId: 'hithink', upstreamSource: 'hithink-financial-api' }] }],
  })) };
  const result = await prepareBacktestRunConfigV3({ request, strategy: input.strategy,
    reader: reader as never, control: control as never, checkedAt: config.dataAsOf });
  expect(result.status, JSON.stringify(result)).toBe('prepared');
  expect(reader.readV3).toHaveBeenCalledWith(expect.objectContaining({ tradabilityMode: 'observed-bars-only',
    routeKey: expect.objectContaining({ capability: 'MINUTE_BAR', timeframe: '1m' }) }));
  const calls = reader.readV3.mock.calls.length;
  control.getPolicy.mockResolvedValueOnce({ contractVersion: 1, consumer: 'thesis-ledger', requestId: 'policy',
    revision: 7, enabled: true, syncState: 'applied', effectiveStale: false, routes: [] });
  expect(await prepareBacktestRunConfigV3({ request, strategy: input.strategy,
    reader: reader as never, control: control as never, checkedAt: config.dataAsOf })).toMatchObject({ status: 'blocked' });
  expect(reader.readV3).toHaveBeenCalledTimes(calls);
});

it('联合预检及复用配置的分钟路由凭据均通过创建校验', async () => {
  const { input, reader, dsa } = await sessionVwapInput();
  const prisma = {
    strategyVersion: { findUnique: async () => ({ schemaVersion: 1, schema: input.strategy }) },
    backtestJob: { findFirst: async () => null },
  };
  const revisions = preparedRevisionReader();
  const guard = new BacktestCreationGuardService(prisma as never, revisions as never);
  const preflight = new BacktestRunPreflightService(
    prisma as never, reader as never, revisions as never, dsa as never, guard,
  );
  const strategyVersionId = '11111111-1111-4111-8111-111111111111';
  const joint = await preflight.check({
    contractVersion: 1, requestId: 'minute-check', strategyVersionId, runConfig: input.runConfig,
  });
  expect(joint, JSON.stringify(joint.diagnostics)).toMatchObject({ status: 'ready', revisionStamp: { targetSequences: [{
    requirement: { capability: 'MINUTE_BAR', routeKey: { capability: 'MINUTE_BAR', timeframe: '1m' } },
  }] } });
  const configured = new BacktestConfiguredRunService(prisma as never, reader as never, revisions as never);
  const resolved = await configured.resolve(strategyVersionId, input.runConfig, 'minute-reuse');
  if (resolved.kind !== 'prepared') throw new Error('预期返回冻结配置的创建凭据');
  await expect(guard.check(resolved.input, input.strategy)).resolves.toBeUndefined();
  expect(reader.readV3.mock.calls.map(([request]) => request.tradabilityMode)).toEqual([
    'observed-bars-only', 'observed-bars-only',
  ]);
});
