import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function runFrozenExchange(manifest, rows, strategy, config) {
  const server = resolve(process.cwd(), 'apps/server/dist/src/backtest');
  const load = (name) => import(pathToFileURL(resolve(server, name)));
  const { runExchangeVertical } = await load('backtest-v2-execution-exchange.js');
  const { prepareTradingStatusExecutionV3 } = await load('backtest-trading-status-execution-v3.js');
  const { readSnapshotPublicFeesV3 } = await load('backtest-public-fees-snapshot-v3.js');
  const { statusPriceExecutionModelV3 } = await load('backtest-status-price-model-v3.js');
  const status = prepareTradingStatusExecutionV3(manifest, config, rows);
  let executionConfig =
    readSnapshotPublicFeesV3(
      manifest,
      config,
      rows.get(`${manifest.runId}/metadata/public-fees-v3.parquet`) ?? [],
    )?.runConfig ?? config;
  if (status.status?.disclosure.status === 'source')
    executionConfig = {
      ...executionConfig,
      executionModel: statusPriceExecutionModelV3(
        config,
        status.status.disclosure.response,
        executionConfig.executionModel,
      ),
    };
  return runExchangeVertical({
    runId: manifest.runId,
    strategyVersionId: manifest.strategyVersionId,
    snapshotId: manifest.contentHash,
    strategy,
    runConfig: executionConfig,
    rows: status.executionRows,
    artifacts: manifest.artifacts,
    engineVersion: 'thesis-ledger-v3-local-runner-v2',
    marketRuleVersion: manifest.marketRuleVersion,
    calendarVersion: manifest.calendarVersion,
    aggregationVersion: manifest.aggregationVersion,
  });
}

/** 已完成快照的只读假设对照；复用原引擎，派生配置只存在内存。 */
export async function compareFrozenKnownCash(manifest, rows, strategy, originalConfig) {
  const prepared = originalConfig.knownCashPreparation;
  if (!prepared?.input.assessment) return undefined;
  const unknown = prepared.input.records.filter((record) => record.statusBasis === 'unverified');
  if (!unknown.length) return { status: 'not-needed', uncertainRecords: 0 };
  const server = resolve(process.cwd(), 'apps/server/dist/src/backtest');
  const load = (name) => import(pathToFileURL(resolve(server, name)));
  const { freezeKnownCashResearchInputV3 } = await load('backtest-known-cash-research-v3.js');
  const { hashCanonicalManifest } = await load('backtest-snapshot.js');
  const { knownCashSnapshotRowsV3, knownCashMetadataKeyV3, knownCashRecordsKeyV3 } = await load(
    'backtest-known-cash-snapshot-v3.js',
  );
  const outcomes = {};
  for (const selection of ['exclude', 'assume-scheduled']) {
    const derived = structuredClone(prepared);
    const policy = { ...derived.input.policy, uncertainRecords: selection };
    derived.input = freezeKnownCashResearchInputV3({ ...derived.input, policy });
    derived.acquisition.exchange.request.researchPolicy = policy;
    derived.acquisition.exchange.response.researchPolicy = policy;
    derived.contentHash = hashCanonicalManifest(derived);
    const scenarioRows = new Map(rows);
    const metadataKey = `${manifest.runId}/${knownCashMetadataKeyV3}`;
    const control = JSON.parse(rows.get(metadataKey)[0].control);
    control.researchPolicy = policy;
    const cash = knownCashSnapshotRowsV3(derived, derived.contentHash, control);
    scenarioRows.set(metadataKey, cash.metadata);
    scenarioRows.set(`${manifest.runId}/${knownCashRecordsKeyV3}`, cash.records);
    const config = { ...originalConfig, knownCashPreparation: derived };
    const result = await runFrozenExchange(manifest, scenarioRows, strategy, config);
    outcomes[selection] = {
      equityCurve: result.analytics.equityCurve,
      trades: result.trades,
      fills: result.fills,
      rejects: result.rejects,
      cashEvents: result.cashEvents,
    };
    assert.deepEqual(derived.input.assessment, prepared.input.assessment);
    assert.deepEqual(derived.input.records, prepared.input.records);
  }
  return {
    status: 'recomputed',
    sourcePreparationHash: prepared.contentHash,
    uncertainRecords: unknown.length,
    sameFrozenPricesAndRecords: true,
    interpretation: '假设敏感性对照，不是误差上下界，不能覆盖漏报事件',
    outcomes,
  };
}
