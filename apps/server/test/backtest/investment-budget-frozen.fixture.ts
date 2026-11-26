import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DecimalValue as D, type SimulationFillRecord } from '@thesis-ledger/domain';
import type {
  BacktestSnapshotManifestV3,
  BacktestStrategy,
  RunConfigV3,
} from '@thesis-ledger/schemas';
import type { ArtifactRef, ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import {
  LocalSnapshotStore,
  canonicalizeManifest,
  hashCanonicalManifest,
} from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { snapshotPriceInputBindingsRowV3 } from '../../src/backtest/backtest-snapshot-v3-completeness.js';
import { collectUsedSignalSources } from '../../src/backtest/backtest-dependency-price.js';

export type FrozenInvestmentInput = {
  job: { id: string; runConfig: RunConfigV3 };
  version: { schema: BacktestStrategy };
  manifest: BacktestSnapshotManifestV3;
  artifacts: { ref: ArtifactRef; rows: ArtifactRow[] }[];
  executionRowsHash: string;
};
export const rowHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** 只重建本次元数据与成本假设；行情、日历、身份和来源证据保持原冻结值。 */
export async function investmentSnapshot(
  source: FrozenInvestmentInput,
  root: string,
  runId: string,
  versionId: string,
  strategy: BacktestStrategy,
) {
  const config = structuredClone(source.job.runConfig);
  config.priceInputBindings!.signals = collectUsedSignalSources(strategy).map((s) => ({
    sourceId: s.id,
    binding: 'execution-series',
  }));
  for (const segment of config.executionModel!.segments) {
    assert(segment.fees, '原冻结执行模型缺少费用定义');
    segment.fees.commission = {
      treatment: 'charged',
      side: 'both',
      basis: 'turnover',
      currency: 'HKD',
      rate: '0.001',
      minimum: { kind: 'amount', amount: '10' },
    };
  }
  const manifest: BacktestSnapshotManifestV3 = JSON.parse(
    JSON.stringify(source.manifest).replaceAll(source.job.id, runId),
  );
  manifest.runId = runId;
  manifest.strategyVersionId = versionId;
  manifest.strategyVersionHash = hashCanonicalManifest(strategy);
  manifest.runConfigChecksum = hashCanonicalManifest(config);
  manifest.executionModel!.contentHash = hashCanonicalManifest(config.executionModel);
  manifest.artifacts = [];
  manifest.status = 'building';
  delete manifest.contentHash;
  delete manifest.comparableDataFingerprint;
  const store = new LocalSnapshotStore(root);
  await store.v3.startBuild(manifest);
  const refs: ArtifactRef[] = [];
  for (const artifact of source.artifacts) {
    const key = artifact.ref.key.slice(source.job.id.length + 1);
    let rows = structuredClone(artifact.rows);
    if (key.startsWith('metadata/'))
      rows = JSON.parse(JSON.stringify(rows).replaceAll(source.job.id, runId));
    if (key === 'metadata/snapshot-metadata-v3.parquet')
      rows = [
        {
          ...rows[0]!,
          strategy: canonicalizeManifest(strategy),
          runConfig: canonicalizeManifest(config),
        },
      ];
    if (key === 'metadata/execution-model-v3.parquet')
      rows = [{ kind: 'execution-model-v3', model: canonicalizeManifest(config.executionModel) }];
    if (key === 'metadata/price-input-bindings-v3.parquet')
      rows = [snapshotPriceInputBindingsRowV3({ strategy, runConfig: config })];
    if (key === 'metadata/public-fees-v3.parquet') {
      const payload = JSON.parse(String(rows[0]!.payload));
      assert.equal(payload.disclosure.status, 'executionModel');
      payload.modelContentHash = hashCanonicalManifest(config.executionModel);
      rows[0]!.payload = canonicalizeManifest(payload);
    }
    if (key === 'metadata/trading-status-v3.parquet') {
      const payload = JSON.parse(String(rows[0]!.payload));
      payload.runConfigChecksum = hashCanonicalManifest(config);
      rows[0]!.payload = canonicalizeManifest(payload);
    }
    refs.push(
      await store.v3.putArtifact(runId, {
        key,
        rows,
        artifactId: hashCanonicalManifest({ runId, key, rows }),
      }),
    );
  }
  const finalized = await store.v3.finalize(runId, manifest, refs);
  const executionRef = refs.find((r) => r.key.endsWith('/execution/bars.parquet'))!;
  const rows: ArtifactRow[] = [];
  for await (const row of await store.artifacts.openRead(executionRef)) rows.push(row);
  const original = source.artifacts.find((a) =>
    a.ref.key.endsWith('/execution/bars.parquet'),
  )!.rows;
  assert.deepEqual(rows, original);
  assert.equal(rowHash(rows), source.executionRowsHash);
  assert.equal(finalized.comparableDataFingerprint, source.manifest.comparableDataFingerprint);
  const runner = new LocalSnapshotV3Runner(store);
  return {
    config,
    manifest: finalized,
    runner,
    store,
    rows,
    run: () =>
      runner.run(
        {
          runId,
          snapshotRef: { snapshotId: finalized.contentHash!, contentHash: finalized.contentHash! },
          artifactRefs: refs,
        },
        new AbortController().signal,
      ),
  };
}

export function verifyInvestmentFills(
  strategy: BacktestStrategy,
  rows: ArtifactRow[],
  fills: readonly SimulationFillRecord[],
  initial: string,
) {
  const bars = [...rows].sort(
    (a, b) => Date.parse(String(a.occurredAt)) - Date.parse(String(b.occurredAt)),
  );
  const byDate = new Map(bars.map((row, i) => [String(row.occurredAt).slice(0, 10), i]));
  let cash = D.from(initial),
    held = D.from('0'),
    cycleBuys = 0,
    additions = 0,
    dynamicBuys = 0;
  const evidence = [];
  for (const fill of fills) {
    const i = byDate.get(fill.occurredAt.slice(0, 10));
    assert(i !== undefined, '成交日期不在原冻结行情');
    const open = D.from(String(bars[i]!.open)),
      occupied = held.times(open),
      equity = cash.plus(occupied);
    const fees = fill.charges.reduce((sum, fee) => {
      assert.equal(fee.currency, 'HKD');
      return sum.plus(fee.amount);
    }, D.from('0'));
    const turnover = D.from(fill.quantity).times(fill.price);
    if (fill.side === 'buy') {
      const plan = strategy.tradePlan;
      let fraction = strategy.sizing.type === 'percentOfEquity' ? strategy.sizing.percent : '';
      let scope = 'order';
      if (plan?.riskBudget) {
        fraction = plan.riskBudget.maxEquityFraction;
        scope = 'position';
      }
      if (plan?.volatilityTarget) {
        const v = plan.volatilityTarget,
          closes = bars.slice(i - v.returnPeriods - 1, i).map((r) => D.from(String(r.close)));
        assert.equal(closes.length, v.returnPeriods + 1);
        const returns = closes
          .slice(1)
          .map((p, j) => Number(p.dividedBy(closes[j]!, 40).minus('1').toString()));
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const annual = Math.sqrt(
          (returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1)) *
            v.annualizationPeriods,
        );
        assert(annual > 0 && Number.isFinite(annual));
        const target = D.from(v.targetAnnualVolatility).dividedBy(D.fromNumber(annual), 40);
        fraction =
          target.compareTo(v.maxEquityFraction) < 0 ? target.toString() : v.maxEquityFraction;
        scope = 'position';
        if (D.from(fraction).compareTo(v.maxEquityFraction) < 0) dynamicBuys++;
      }
      if (held.isPositive() && plan?.stages.some((s) => s.action.kind === 'add')) {
        const stages = plan.stages.filter((s) => s.action.kind === 'add');
        assert.equal(stages.length, 1, '验收只授权单个加仓阶段');
        const action = stages[0]!.action;
        assert.equal(action.kind, 'add');
        if (action.kind === 'add') fraction = action.maxEquityFraction;
        scope = 'position';
        additions++;
      }
      assert(fraction, '未识别买入比例');
      const outflow = turnover.plus(fees),
        cap = equity.times(fraction),
        occupiedInCap = scope === 'position' ? occupied : D.from('0');
      assert(fees.isPositive(), '正费用未实际生效');
      assert(D.from(fill.price).compareTo(open) > 0, '正滑点未实际生效');
      assert(
        outflow.plus(occupiedInCap).compareTo(cap) <= 0,
        fill.fillId + ' 超出含费用和滑点投入上限',
      );
      assert(outflow.compareTo(cash) <= 0, '现金透支');
      evidence.push({
        fillId: fill.fillId,
        at: fill.occurredAt,
        quantity: fill.quantity,
        rawOpen: open.toString(),
        price: fill.price,
        cashBefore: cash.toString(),
        heldBefore: held.toString(),
        equity: equity.toString(),
        fraction,
        scope,
        occupied: occupiedInCap.toString(),
        fees: fees.toString(),
        outflow: outflow.toString(),
        cap: cap.toString(),
        slack: cap.minus(occupiedInCap).minus(outflow).toString(),
      });
      cash = cash.minus(outflow);
      held = held.plus(fill.quantity);
      cycleBuys++;
    } else {
      cash = cash.plus(turnover).minus(fees);
      held = held.minus(fill.quantity);
      if (!held.isPositive()) cycleBuys = 0;
    }
  }
  assert(evidence.length > 0, '未发生买入');
  return {
    checkedBuys: evidence.length,
    totalFills: fills.length,
    additions,
    dynamicBuys,
    cycleBuys,
    evidence,
  };
}
