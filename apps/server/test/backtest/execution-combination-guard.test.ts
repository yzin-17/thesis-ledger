import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { runConfigSchemaV3, backtestRunPreparationRequestV3Schema } from '@thesis-ledger/schemas';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { BacktestV3RunLifecycle } from '../../src/backtest/backtest-v3-run-lifecycle.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { preparationStampFor } from './v3-preparation-fixtures.js';

async function fixture() {
  const f = await completeSnapshotFixture();
  const model = JSON.parse(JSON.stringify(f.input.runConfig.executionModel));
  model.scope = { ...model.scope, symbol: 'AAPL.US', market: 'US', currency: 'USD',
    instrumentType: 'STOCK', timezone: 'America/New_York' };
  const profile = JSON.parse(readFileSync(new URL('../../../../packages/schemas/fixtures/backtest-broker-commission.futu.json', import.meta.url), 'utf8')).US;
  for (const segment of model.segments) {
    segment.execution.calendarMarket = 'US';
    delete segment.execution.normalizedExecution;
    segment.fees.currency = 'USD';
    segment.fees.commission = { ...segment.fees.commission, currency: 'USD', rate: '0', minimum: { kind: 'none' } };
    for (const key of ['stampDuty', 'handlingFee', 'transferFee', 'regulatoryFee'])
      segment.fees[key] = { treatment: 'notApplicable', reason: '受控成本隔离' };
    segment.fees.brokerCommission = { ...profile, basis: { kind: 'actualShares' } };
  }
  const matching = { conflict: 'stopFirst', childActivation: 'openSameBarRangeNextBar',
    partialExit: 'protectRemaining', liquidity: { kind: 'perBarCap', quantity: '10' } };
  const config = runConfigSchemaV3.parse({ ...f.input.runConfig, baseCurrency: 'USD', initialCash: { USD: '1000000' },
    executionModel: model, dailyOrderMatching: matching,
    executionPriceProtocol: { ...f.input.runConfig.executionPriceProtocol, accountingBasis: 'raw-events',
      priceBasis: { ...f.input.runConfig.executionPriceProtocol.priceBasis, adjustment: 'none',
        quantityBasis: 'actual-units', volumeBasis: 'original', dividendMeaning: 'explicit-cash' },
    },
  });
  const asset = { symbol: 'AAPL.US', market: 'US' as const, assetType: 'stock' as const };
  const strategy = { ...f.input.strategy, executionInstrument: asset,
    signalSources: f.input.strategy.signalSources.map((source) => ({ ...source, asset })),
    execution: { mode: 'exchange' as const, timing: 'dailyBarOrders' as const, orders: [
      { id: 'entry', action: { kind: 'entry' as const }, order: { kind: 'market' as const }, validity: { kind: 'DAY' as const } },
      { id: 'exit', action: { kind: 'exit' as const }, order: { kind: 'market' as const }, validity: { kind: 'DAY' as const } },
    ] },
  };
  const versionId = '11111111-1111-4111-8111-111111111111';
  const request = backtestRunPreparationRequestV3Schema.parse({ contractVersion: 1, requestId: 'combination',
    strategyVersionId: versionId, adjustment: 'none', accountingBasis: 'raw-events',
    history: { basis: 'fixed-provider-snapshot' }, runConfig: {
      startDate: config.startDate, endDate: config.endDate, dataAsOf: config.dataAsOf,
      baseCurrency: config.baseCurrency, initialCash: config.initialCash,
      valuationPolicy: config.valuationPolicy, executionModel: config.executionModel, dailyOrderMatching: matching,
    },
  });
  const create = { contractVersion: 1, strategyVersionId: versionId, runConfig: config,
    idempotencyKey: 'same-combination', preparationStamp: preparationStampFor(strategy, config, versionId) };
  return { f, strategy, config, request, create };
}

it('受影响组合在价格与路由读取之前具体拒绝，普通整笔进入原准备流程', async () => {
  const { f, strategy, request } = await fixture();
  const control = { getPolicy: vi.fn(async () => ({})) };
  const input = { strategy, request, reader: f.reader, control, checkedAt: '2026-11-20T00:00:00Z' };
  const result = await prepareBacktestRunConfigV3(input);
  expect(result.status).toBe('blocked');
  if (result.status !== 'blocked') throw new Error('应在准备阶段拒绝');
  expect(result.diagnostics[0]!.message).toContain('累计计费');
  expect(control.getPolicy).not.toHaveBeenCalled();
  expect(f.reader.readV3).not.toHaveBeenCalled();
  request.runConfig.dailyOrderMatching!.liquidity = { kind: 'wholeOrder' };
  await prepareBacktestRunConfigV3(input);
  expect(control.getPolicy).toHaveBeenCalledOnce();
});

it('直接创建也受同一限制，已有幂等Run先找回且不重新校验新建限制', async () => {
  const { strategy, config, create } = await fixture();
  const existing = { id: 'original', mode: 'frozen', input: { contractVersion: 1, schemaVersion: 'backtest-trade-run-v1', runConfig: config }, runConfig: config };
  const findFirst = vi.fn().mockResolvedValue(undefined);
  const prisma = { backtestJob: { findFirst },
    strategyVersion: { findUnique: vi.fn(async () => ({ schemaVersion: 1, schema: strategy })) } };
  const builder = { buildV3: vi.fn() }, guard = { check: vi.fn() };
  const lifecycle = new BacktestV3RunLifecycle(prisma as never, builder as never, undefined, true, guard as never);
  await expect(lifecycle.create(create)).rejects.toThrow('累计计费');
  expect(builder.buildV3).not.toHaveBeenCalled();
  expect(guard.check).not.toHaveBeenCalled();
  findFirst.mockResolvedValue(existing);
  expect(await lifecycle.create(create)).toEqual(existing);
  expect(builder.buildV3).not.toHaveBeenCalled();
});
