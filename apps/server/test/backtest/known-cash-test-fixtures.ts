import { readFileSync } from 'node:fs';
import {
  marketKnownCashExchangeV3Schema,
  executionPriceProtocolSchema,
  type BacktestKnownCashPreparationV3,
  type BacktestStrategy,
  strategySchema,
  runConfigSchemaV3,
  backtestExecutionModelSchemaV3,
} from '@thesis-ledger/schemas';
import { prepareKnownCashResearchV3 } from '../../src/backtest/backtest-known-cash-preparation-v3.js';

export async function knownCashPreparedFixture() {
  const base = '../../../../packages/schemas/fixtures/';
  const exchange = marketKnownCashExchangeV3Schema.parse(
    JSON.parse(
      readFileSync(new URL(`${base}market-known-cash-v3.exchange.json`, import.meta.url), 'utf8'),
    ),
  );
  const { routeTarget, dataAsOf, ...scope } = exchange.request;
  const prepared = await prepareKnownCashResearchV3({
    scope,
    clock: { mode: 'requested-time', requestedDataAsOf: dataAsOf },
    executionPriceProtocol: executionPriceProtocolSchema.parse({
      ...JSON.parse(
        readFileSync(new URL(`${base}execution-price.raw-events.json`, import.meta.url), 'utf8'),
      ),
      history: { basis: 'fixed-provider-snapshot' },
      cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1',
    }),
    read: async () => ({
      request: { ...scope, routeTarget, dataAsOf },
      response: exchange.response,
    }),
    now: () => '2026-10-09T14:00:00Z',
  });
  return prepared;
}

export function knownCashControlFixture(prepared: BacktestKnownCashPreparationV3) {
  const source = prepared.acquisition.exchange.request;
  return {
    ...source,
    protocolVersion: 'known-cash-control-v1',
    requestId: 'snapshot-control',
    expectedControlIdentity: prepared.input.source.controlIdentity,
    controlIdentity: prepared.input.source.controlIdentity,
    status: 'verified',
    readOnly: true,
    upstreamRead: false,
    checkedAt: '2026-10-10T00:00:00Z',
    targetSequence: [source.routeTarget],
  };
}

export async function knownCashRunFixture() {
  const prepared = await knownCashPreparedFixture();
  const base = '../../../../packages/schemas/fixtures/';
  const scope = prepared.input.scope;
  const strategyValue = JSON.parse(
    readFileSync(new URL(`${base}backtest-v2.exchange.json`, import.meta.url), 'utf8'),
  );
  strategyValue.executionInstrument = { symbol: scope.symbol, market: 'CN', assetType: 'etf' };
  strategyValue.signalSources = [
    {
      id: 'execution',
      asset: strategyValue.executionInstrument,
      timeframe: '1d',
      series: ['close'],
    },
  ];
  strategyValue.entry = {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'execution', field: 'close' },
    right: { type: 'constant', value: '0' },
  };
  strategyValue.exit = {
    type: 'compare',
    operator: 'lt',
    left: { type: 'series', sourceId: 'execution', field: 'close' },
    right: { type: 'constant', value: '0' },
  };
  strategyValue.risk = [];
  strategyValue.cost = { commissionRate: '0', slippageRate: '0' };
  const model = JSON.parse(
    readFileSync(
      new URL(`${base}backtest-execution-model.cn-2024q1.json`, import.meta.url),
      'utf8',
    ),
  );
  model.scope = { ...model.scope, ...scope, range: { start: scope.startDate, end: scope.endDate } };
  delete model.scope.startDate;
  delete model.scope.endDate;
  delete model.scope.dataAsOf;
  for (const segment of model.segments) {
    segment.range = model.scope.range;
    segment.source.configuredAt = '2026-10-09T13:00:00Z';
    segment.execution.price = { kind: 'noDailyLimit', reason: '定向现金测试的显式假设' };
  }
  return {
    prepared,
    strategy: strategySchema.parse(strategyValue) as BacktestStrategy,
    runConfig: runConfigSchemaV3.parse({
      schemaVersion: '3',
      startDate: scope.startDate,
      endDate: scope.endDate,
      dataAsOf: scope.dataAsOf,
      baseCurrency: 'CNY',
      initialCash: { CNY: '100000' },
      valuationPolicy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '15:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      },
      executionModel: backtestExecutionModelSchemaV3.parse(model),
      executionPriceProtocol: prepared.input.executionPriceProtocol,
      knownCashPreparation: prepared,
      priceInputBindings: {
        signals: [{ sourceId: 'execution', binding: 'execution-series' }],
        benchmark: { binding: 'execution-series' },
      },
      frozenExecutionWindow: {
        version: 'market-frozen-window-v1',
        identityFingerprint: 'a'.repeat(64),
        responseHash: 'b'.repeat(64),
      },
    }),
  };
}
