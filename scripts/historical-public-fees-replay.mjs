import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// 只读现有快照并计算，不保存结果、不调用服务或修改目标状态。
const [runId, expectedChecksum, expectedFeesStatus = 'source'] = process.argv
  .slice(2)
  .filter((arg) => !['--benchmark', '--trading-status'].includes(arg));
const verifyBenchmark = process.argv.includes('--benchmark');
const verifyTradingStatus = process.argv.includes('--trading-status');
if (!runId || !expectedChecksum) {
  console.log(
    '用法：node scripts/historical-public-fees-replay.mjs <任务ID> <结果校验和> [source|executionModel] [--benchmark] [--trading-status]',
  );
} else {
  assert(['source', 'executionModel'].includes(expectedFeesStatus), '未知收费冻结状态');
  const server = resolve(process.cwd(), 'apps/server/dist/src/backtest');
  const { LocalSnapshotStore } = await import(
    pathToFileURL(resolve(server, 'backtest-snapshot.js')).href
  );
  const { LocalSnapshotV3Runner } = await import(
    pathToFileURL(resolve(server, 'backtest-v3-runner.js')).href
  );
  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error('离线重放不允许联网');
  };
  const store = new LocalSnapshotStore(
    process.env.BACKTEST_SNAPSHOT_ROOT ?? resolve(process.cwd(), 'var/backtest'),
  );
  const manifest = await store.v3.replay(runId);
  const input = {
    runId,
    snapshotRef: { snapshotId: manifest.contentHash, contentHash: manifest.contentHash },
    artifactRefs: manifest.artifacts,
  };
  const runner = new LocalSnapshotV3Runner(store);
  const first = await runner.run(input, new AbortController().signal);
  const second = await runner.run(input, new AbortController().signal);
  assert.deepEqual(first, second);
  assert.equal(first.resultChecksum, expectedChecksum);
  assert.equal(first.publicFeesDisclosure?.status, expectedFeesStatus);
  assert.equal(networkCalls, 0);
  const rows = new Map();
  if (verifyBenchmark || verifyTradingStatus) {
    for (const artifact of manifest.artifacts) {
      const values = [];
      for await (const row of await store.artifacts.openRead(artifact)) values.push(row);
      rows.set(artifact.key, values);
    }
  }
  let tradingStatusVerification;
  if (verifyTradingStatus) {
    assert.equal(manifest.tradingStatus?.freezeVersion, 'frozen-trading-status-v1');
    const disclosure = first.tradingStatusDisclosure;
    assert.equal(disclosure?.status, 'source');
    assert.equal(disclosure.response.symbol, '000995.SZ');
    assert.deepEqual(
      disclosure.response.days.map((day) => [day.date, day.state]),
      [
        ['2023-08-16', 'unknown'],
        ['2023-08-17', 'suspended'],
        ['2023-08-18', 'trading'],
        ['2023-08-19', 'unknown'],
        ['2023-08-20', 'unknown'],
        ['2023-08-21', 'unknown'],
      ],
    );
    const bars = rows
      .get(`${runId}/execution/bars.parquet`)
      .filter(
        (row) =>
          String(row.occurredAt).slice(0, 10) >= '2023-08-16' &&
          String(row.occurredAt).slice(0, 10) <= '2023-08-21',
      );
    const dates = bars.map((row) => String(row.occurredAt).slice(0, 10));
    assert.deepEqual(dates, ['2023-08-16', '2023-08-18', '2023-08-21']);
    assert(
      bars.every((row) => row.suspended === undefined),
      '冻结价格被状态改写',
    );
    assert(rows.get(manifest.tradingStatus.artifactKey)?.length === 1);
    assert(!first.simulationFills.some((fill) => fill.occurredAt.startsWith('2023-08-17')));
    assert(
      first.simulationFills.some(
        (fill) => fill.side === 'buy' && fill.occurredAt.startsWith('2023-08-18'),
      ),
    );
    assert(
      first.simulationFills.some(
        (fill) => fill.side === 'sell' && fill.occurredAt.startsWith('2023-08-21'),
      ),
    );
    tradingStatusVerification = {
      source: disclosure.response.provenance,
      days: disclosure.response.days,
      frozenPriceDates: dates,
      immutablePrices: true,
      statusArtifact: manifest.tradingStatus.artifactKey,
    };
  }
  let benchmarkVerification;
  if (verifyBenchmark) {
    assert.equal(manifest.benchmarkCostVersion, 'execution-model-cost-v1');
    assert.equal(first.benchmarkCompatibility?.costAssumption.kind, 'execution-model');
    assert.equal(first.benchmark?.totalReturn?.status, 'available');
    const metadata = rows.get(`${runId}/metadata/snapshot-metadata-v3.parquet`)[0];
    const runConfig = JSON.parse(metadata.runConfig);
    const strategy = JSON.parse(metadata.strategy);
    const bars = rows
      .get(`${runId}/execution/bars.parquet`)
      .filter(
        (row) =>
          String(row.occurredAt).slice(0, 10) >= runConfig.startDate &&
          String(row.occurredAt).slice(0, 10) <= runConfig.endDate,
      )
      .sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));
    const buy = bars[0];
    const sell = bars.at(-1);
    assert.equal(String(buy.occurredAt).slice(0, 10), first.equityCurve[0].occurredAt.slice(0, 10));
    assert.equal(
      String(sell.occurredAt).slice(0, 10),
      first.equityCurve.at(-1).occurredAt.slice(0, 10),
    );
    const { resolveFrozenBenchmarkCostV3 } = await import(
      pathToFileURL(resolve(server, 'backtest-v3-benchmark-cost.js')).href
    );
    const { readSnapshotPublicFeesV3 } = await import(
      pathToFileURL(resolve(server, 'backtest-public-fees-snapshot-v3.js')).href
    );
    const { resolveNormalizedExecutionModelSegment } = await import('@thesis-ledger/domain');
    const publicFees = readSnapshotPublicFeesV3(
      manifest,
      runConfig,
      rows.get(`${runId}/metadata/public-fees-v3.parquet`) ?? [],
    );
    const model = publicFees?.runConfig.executionModel ?? runConfig.executionModel;
    const currency = runConfig.baseCurrency;
    const segment = (at) =>
      resolveNormalizedExecutionModelSegment(model, {
        expectedVersion: model.version,
        symbol: strategy.executionInstrument.symbol,
        market: strategy.executionInstrument.market,
        instrumentType: 'STOCK',
        currency,
        evaluatedAt: at,
        dataAsOf: runConfig.dataAsOf,
      });
    const resolved = resolveFrozenBenchmarkCostV3({
      manifest,
      rows,
      runConfig,
      strategy,
      firstClose: String(buy.close),
      firstOccurredAt: buy.occurredAt,
      lastClose: String(sell.close),
      lastOccurredAt: sell.occurredAt,
    });
    assert.equal(resolved.result.status, 'available');
    assert.equal(resolved.result.value, first.benchmark.totalReturn.value);
    benchmarkVerification = {
      inputs: {
        initialCash: runConfig.initialCash[currency],
        currency,
        firstClose: String(buy.close),
        lastClose: String(sell.close),
        firstOccurredAt: buy.occurredAt,
        lastOccurredAt: sell.occurredAt,
        slippageRate: strategy.cost.slippageRate,
        buyFees: segment(buy.occurredAt).fees,
        sellFees: segment(sell.occurredAt).fees,
      },
      calculation: resolved.result,
      metrics: first.metrics,
      benchmark: first.benchmark,
    };
    assert.equal(networkCalls, 0);
  }
  console.log(
    JSON.stringify(
      {
        runId,
        snapshotId: manifest.contentHash,
        resultChecksum: first.resultChecksum,
        identicalReplay: true,
        networkCalls,
        feesStatus: first.publicFeesDisclosure.status,
        feeSource:
          first.publicFeesDisclosure.status === 'source'
            ? {
                ...first.publicFeesDisclosure.response.provenance,
                routeTarget: first.publicFeesDisclosure.response.routeTarget,
                fallbackReason: first.publicFeesDisclosure.fallbackReason,
              }
            : { reason: first.publicFeesDisclosure.reason },
        fills: first.simulationFills.length,
        ...(tradingStatusVerification ? { tradingStatusVerification } : {}),
        ...(benchmarkVerification ? { benchmarkVerification } : {}),
      },
      null,
      2,
    ),
  );
}
