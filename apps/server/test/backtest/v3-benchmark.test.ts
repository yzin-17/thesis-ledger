import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DecimalValue } from '@thesis-ledger/domain';
import {
  backtestBenchmarkCompatibilitySchemaV3,
  backtestMetricSchema,
  runConfigSchemaV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';
import { afterEach, describe, expect, it } from 'vitest';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import {
  buildBacktestV3Benchmark,
  type BacktestV3BenchmarkProjection,
} from '../../src/backtest/backtest-v3-benchmark.js';
import { calculateBacktestV3BenchmarkReturn } from '../../src/backtest/backtest-v3-benchmark-cost.js';
import { runExchangeVertical } from '../../src/backtest/backtest-v2-execution-exchange.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

const directories: string[] = [];

type ExchangeExecutionSegment = Extract<
  NonNullable<RunConfigV3['executionModel']>['segments'][number],
  { execution: { mode: 'exchange' } }
>;
type ExecutionFees = ExchangeExecutionSegment['fees'];
type ProportionalFee = ExecutionFees['stampDuty'];

const proportionalize = (fee: ProportionalFee, feeRate: string): ProportionalFee => {
  if (fee.treatment !== 'charged') return fee;
  return {
    ...fee,
    treatment: 'charged',
    side: 'both',
    basis: 'turnover',
    rate: feeRate,
    minimum: { kind: 'none' },
  };
};

const setSmallPerChargeFees = (fees: ExecutionFees): ExecutionFees => ({
  ...fees,
  commission: {
    ...fees.commission,
    side: 'both',
    rate: '0.003',
    minimum: { kind: 'none' },
  },
  stampDuty: proportionalize(fees.stampDuty, '0'),
  transferFee: proportionalize(fees.transferFee, '0.003'),
});

const benchmarkMetric = (projection: BacktestV3BenchmarkProjection, key: string) => {
  const metric = projection.benchmark[key];
  if (!metric) throw new Error(`Benchmark 缺少指标: ${key}`);
  return metric;
};

const executionFees = (runConfig: RunConfigV3): ExecutionFees => {
  const segment = runConfig.executionModel?.segments.find(
    (candidate) => candidate.execution.mode === 'exchange' && candidate.fees !== null,
  );
  if (!segment || segment.execution.mode !== 'exchange' || segment.fees === null) {
    throw new Error('Fixture 缺少 Exchange execution fees');
  }
  return segment.fees;
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

const setProportionalCosts = (runConfig: RunConfigV3, zero = false) => {
  if (!runConfig.executionModel) throw new Error('Fixture 缺少 execution model');
  const rate = zero ? '0' : '0.0003';
  const otherRate = zero ? '0' : '0.0002';
  const model = structuredClone(runConfig.executionModel);
  model.segments = model.segments.map((segment): (typeof model.segments)[number] => {
    if (segment.execution.mode !== 'exchange' || segment.fees === null) return segment;
    const { fees } = segment;
    return {
      ...segment,
      fees: {
        ...fees,
        commission: {
          ...fees.commission,
          side: 'both',
          rate,
          minimum: { kind: 'none' },
        },
        stampDuty: proportionalize(fees.stampDuty, otherRate),
        transferFee: proportionalize(fees.transferFee, zero ? '0' : '0.00001'),
        regulatoryFee: proportionalize(fees.regulatoryFee, zero ? '0' : '0.00001'),
        handlingFee: proportionalize(fees.handlingFee, zero ? '0' : '0.00001'),
      },
    };
  });
  Object.assign(runConfig, runConfigSchemaV3.parse({ ...runConfig, executionModel: model }));
};

const setup = async (cost: 'default' | 'proportional' | 'zero' = 'proportional') => {
  const root = await mkdtemp(join(tmpdir(), 'v3-benchmark-'));
  directories.push(root);
  const fixture = await completeSnapshotFixture();
  if (cost !== 'default') {
    setProportionalCosts(fixture.input.runConfig, cost === 'zero');
    fixture.input.strategy.cost.slippageRate = cost === 'zero' ? '0' : '0.001';
  }
  fixture.input.strategyVersionHash = hashCanonicalManifest(fixture.input.strategy);
  const snapshots = new LocalSnapshotStore(root);
  const built = await new DsaSnapshotBuilder(
    fixture.dsa as unknown as DsaClient,
    snapshots,
    fixture.reader,
  ).buildV3(fixture.input);
  const rows = new Map<string, readonly ArtifactRow[]>();
  for (const artifact of built.artifactRefs) {
    const values: ArtifactRow[] = [];
    for await (const row of await snapshots.artifacts.openRead(artifact)) values.push(row);
    rows.set(artifact.key, values);
  }
  const vertical = runExchangeVertical({
    ...fixture.input,
    snapshotId: built.snapshotRef.snapshotId,
    artifacts: built.artifactRefs,
    rows,
    engineVersion: 'v3-benchmark-test',
    marketRuleVersion: built.manifest.marketRuleVersion,
    calendarVersion: built.manifest.calendarVersion,
    aggregationVersion: built.manifest.aggregationVersion,
  });
  const input = {
    runConfig: fixture.input.runConfig,
    strategy: fixture.input.strategy,
    manifest: built.manifest,
    rows,
    analytics: vertical.analytics,
  };
  return { input, vertical };
};

const executionBars = (rows: ReadonlyMap<string, readonly ArtifactRow[]>) => {
  const entry = [...rows.entries()].find(([key]) => key.endsWith('/execution/bars.parquet'));
  if (!entry) throw new Error('Fixture 缺少 execution bars');
  return entry[1];
};

describe('V3 同执行序列 Benchmark', () => {
  it('按交易日对齐日线与估值，保留可见时刻约束', async () => {
    const { input } = await setup('zero');
    const rows = new Map(input.rows);
    const key = [...rows.keys()].find((value) => value.endsWith('/execution/bars.parquet'))!;
    const shifted = rows.get(key)!.map((row) => ({
      ...row,
      occurredAt: `${String(row.occurredAt).slice(0, 10)}T00:00:00.000Z`,
    }));
    rows.set(key, shifted);
    expect(shifted[0]?.occurredAt).not.toBe(input.analytics.equityCurve[0]?.occurredAt);

    const current = buildBacktestV3Benchmark({
      ...input,
      rows,
    });
    expect(benchmarkMetric(current, 'totalReturn').status).toBe('available');
    expect(current.benchmarkCompatibility.status).toBe('compatible');
    expect(current.warnings).toContain(
      'BENCHMARK_EVALUATION:v3-buy-first-in-range-close-liquidate-last-in-range-close-by-trading-date-v2',
    );
  });

  it('使用冻结比例费用、策略滑点和首末区间估值收盘计算收益，排除预热数据', async () => {
    const { input } = await setup('proportional');
    const projection = buildBacktestV3Benchmark(input);
    const bars = executionBars(input.rows);
    const inRange = bars.filter(
      (row) =>
        typeof row.occurredAt === 'string' &&
        row.occurredAt.slice(0, 10) >= input.runConfig.startDate &&
        row.occurredAt.slice(0, 10) <= input.runConfig.endDate,
    );
    const warmup = bars.filter(
      (row) =>
        typeof row.occurredAt === 'string' &&
        row.occurredAt.slice(0, 10) < input.runConfig.startDate,
    );
    expect(warmup.length).toBeGreaterThan(0);
    expect(inRange.length).toBeGreaterThanOrEqual(2);
    expect(projection.benchmarkCompatibility.status).toBe('compatible');
    expect(projection.benchmarkCompatibility.costAssumption).toMatchObject({
      kind: 'proportional',
      commissionRate: '0.00051',
      slippageRate: '0.001',
    });
    const cost = projection.benchmarkCompatibility.costAssumption;
    if (cost.kind === 'unavailable' || cost.kind === 'unsupported') {
      throw new Error('Fixture 应生成可计算的比例成本');
    }
    const initialCash = input.runConfig.initialCash.CNY;
    if (initialCash === undefined) throw new Error('Fixture 缺少 CNY 初始现金');
    const fees = executionFees(input.runConfig);
    const expected = calculateBacktestV3BenchmarkReturn({
      initialCash,
      firstClose: String(inRange[0]!.close),
      lastClose: String(inRange.at(-1)!.close),
      slippageRate: input.strategy.cost.slippageRate,
      currency: 'CNY',
      buyFees: fees,
      sellFees: fees,
    });
    expect(expected.status).toBe('available');
    if (expected.status === 'available') {
      expect(benchmarkMetric(projection, 'totalReturn')).toEqual({
        status: 'available',
        value: expected.value,
      });
    }
    expect(benchmarkMetric(projection, 'totalReturn').status).toBe('available');
    expect(projection.benchmarkCompatibility.strategyFingerprint).toBeDefined();
    expect(projection.benchmarkCompatibility.benchmarkFingerprint).toBeDefined();
  });

  it('按初始现金、连续数量和逐项分币舍入计算小本金基准', async () => {
    const { input } = await setup('proportional');
    const fees = setSmallPerChargeFees(executionFees(input.runConfig));
    const calculate = (initialCash: string) =>
      calculateBacktestV3BenchmarkReturn({
        initialCash,
        firstClose: '1',
        lastClose: '1',
        slippageRate: '0',
        currency: 'CNY',
        buyFees: fees,
        sellFees: fees,
      });

    const oneUnit = calculate('1');
    expect(oneUnit).toMatchObject({
      status: 'available',
      value: '0',
      quantity: '1',
      buyFees: '0',
      buyDebit: '1',
      residualCash: '0',
      sellFees: '0',
      finalCash: '1',
    });

    const threeUnits = calculate('3');
    expect(threeUnits).toMatchObject({
      status: 'available',
      value: '-0.01333333333333333333',
      quantity: '2.98',
      buyGross: '2.98',
      buyFees: '0.02',
      buyDebit: '3',
      residualCash: '0',
      sellGross: '2.98',
      sellFees: '0.02',
      finalCash: '2.96',
    });
    if (threeUnits.status !== 'available') throw new Error('期望可用的买入持有基准');
    expect(
      DecimalValue.from(threeUnits.buyDebit).compareTo(threeUnits.initialCash),
    ).toBeLessThanOrEqual(0);

    const residualCash = calculate('1.67');
    expect(residualCash).toMatchObject({
      status: 'available',
      quantity: '1.6666666666666666666666666666666666666666',
      buyGross: '1.6666666666666666666666666666666666666666',
      buyFees: '0',
      buyDebit: '1.6666666666666666666666666666666666666666',
      residualCash: '0.0033333333333333333333333333333333333334',
      sellGross: '1.6666666666666666666666666666666666666666',
      sellFees: '0',
      finalCash: '1.67',
    });
  });

  it('报告显式冻结的零成本，不继承旧 V2 零成本版本', async () => {
    const { input } = await setup('zero');
    const projection = buildBacktestV3Benchmark(input);
    expect(projection.benchmarkCompatibility.costAssumption).toMatchObject({ kind: 'zero-cost' });
    expect(projection.benchmarkCompatibility.costAssumption).not.toMatchObject({
      version: 'legacy-v2-zero-cost',
    });
    expect(benchmarkMetric(projection, 'totalReturn').status).toBe('available');
  });

  it('最低费用或方向费用不退化为零成本', async () => {
    const { input } = await setup('default');
    const projection = buildBacktestV3Benchmark(input);
    expect(projection.benchmarkCompatibility.costAssumption.kind).toBe('unsupported');
    expect(benchmarkMetric(projection, 'totalReturn')).toEqual({
      status: 'unavailable',
      reason: 'BENCHMARK_COST_MODEL_UNSUPPORTED',
    });
  });

  it('同坐标绑定可依赖唯一 execution actualSource，不要求重复的 benchmark 来源记录', async () => {
    const { input } = await setup('proportional');
    const manifest = structuredClone(input.manifest);
    manifest.actualSources = manifest.actualSources.filter(
      (source) => source.purpose !== 'benchmark',
    );
    const projection = buildBacktestV3Benchmark({ ...input, manifest });
    expect(projection.benchmarkCompatibility.status).toBe('compatible');
    expect(benchmarkMetric(projection, 'totalReturn').status).toBe('available');
  });

  it('缺少显式绑定或行情行时报告未核验，且不产生超额收益', async () => {
    const { input } = await setup('proportional');
    const withoutBinding = structuredClone(input.runConfig);
    delete withoutBinding.priceInputBindings;
    const bindingManifest = {
      ...input.manifest,
      runConfigChecksum: hashCanonicalManifest(withoutBinding),
    };
    const noBinding = buildBacktestV3Benchmark({
      ...input,
      runConfig: withoutBinding,
      manifest: bindingManifest,
    });
    expect(noBinding.benchmarkCompatibility.status).toBe('unverified');
    expect(benchmarkMetric(noBinding, 'excessReturn')).toEqual({
      status: 'unavailable',
      reason: 'BENCHMARK_COMPARISON_UNVERIFIED',
    });

    const missingRows = new Map(input.rows);
    const barsKey = [...missingRows.keys()].find((key) => key.endsWith('/execution/bars.parquet'))!;
    missingRows.delete(barsKey);
    const missingSource = buildBacktestV3Benchmark({ ...input, rows: missingRows });
    expect(benchmarkMetric(missingSource, 'totalReturn').status).toBe('unavailable');
    expect(benchmarkMetric(missingSource, 'excessReturn').status).toBe('unavailable');
  });

  it('来源或币种不一致时不计算可比收益', async () => {
    const { input } = await setup('proportional');
    const incompatibleManifest = structuredClone(input.manifest);
    const benchmarkSource = incompatibleManifest.actualSources.find(
      (source) => source.purpose === 'benchmark',
    )!;
    benchmarkSource.provenance.upstreamSource = 'different-upstream';
    const incompatible = buildBacktestV3Benchmark({ ...input, manifest: incompatibleManifest });
    expect(incompatible.benchmarkCompatibility.status).toBe('incompatible');
    expect(benchmarkMetric(incompatible, 'excessReturn')).toEqual({
      status: 'unavailable',
      reason: 'BENCHMARK_COMPARISON_INCOMPATIBLE',
    });

    const currencyConfig = structuredClone(input.runConfig);
    currencyConfig.baseCurrency = 'HKD';
    const currencyManifest = {
      ...input.manifest,
      runConfigChecksum: hashCanonicalManifest(currencyConfig),
    };
    const currency = buildBacktestV3Benchmark({
      ...input,
      runConfig: currencyConfig,
      manifest: currencyManifest,
    });
    expect(currency.benchmarkCompatibility.status).toBe('unverified');
    expect(benchmarkMetric(currency, 'totalReturn')).toEqual({
      status: 'unavailable',
      reason: 'BENCHMARK_CURRENCY_MISMATCH',
    });

    const multiCurrencyConfig = runConfigSchemaV3.parse({
      ...input.runConfig,
      initialCash: { ...input.runConfig.initialCash, USD: '10' },
    });
    const multiCurrency = buildBacktestV3Benchmark({
      ...input,
      runConfig: multiCurrencyConfig,
      manifest: {
        ...input.manifest,
        runConfigChecksum: hashCanonicalManifest(multiCurrencyConfig),
      },
    });
    expect(benchmarkMetric(multiCurrency, 'totalReturn')).toEqual({
      status: 'unavailable',
      reason: 'BENCHMARK_MULTICURRENCY_INITIAL_CASH_UNSUPPORTED',
    });
    expect(multiCurrency.benchmarkCompatibility.status).toBe('unverified');
  });

  it('拒绝晚于冻结截点的观测，不回填成历史可见时间', async () => {
    const { input } = await setup('proportional');
    const changedRows = new Map(input.rows);
    const barsKey = [...changedRows.keys()].find((key) => key.endsWith('/execution/bars.parquet'))!;
    const bars = [...changedRows.get(barsKey)!];
    const lastRangeIndex = bars.findIndex(
      (row) => row.occurredAt === `${input.runConfig.endDate}T07:00:00.000Z`,
    );
    expect(lastRangeIndex).toBeGreaterThanOrEqual(0);
    bars[lastRangeIndex] = { ...bars[lastRangeIndex]!, availableAt: '2026-05-22T07:00:00.000Z' };
    changedRows.set(barsKey, bars);
    const projection = buildBacktestV3Benchmark({ ...input, rows: changedRows });
    expect(benchmarkMetric(projection, 'totalReturn').status).toBe('unavailable');
    expect(projection.warnings).toContain('BENCHMARK_FUTURE_OBSERVATION');
  });

  it('严格 PIT 收盘晚于同毫秒估值时刻一微秒时不计算 Benchmark', async () => {
    const { input } = await setup('proportional');
    const valuationAt = input.analytics.equityCurve.at(-1)?.occurredAt;
    expect(valuationAt).toMatch(/\.000Z$/);
    const runConfig = runConfigSchemaV3.parse({
      ...input.runConfig,
      executionPriceProtocol: {
        ...input.runConfig.executionPriceProtocol,
        history: { basis: 'point-in-time', reconstructionEvidenceRef: 'synthetic-verified-window' },
      },
    });
    const manifest = {
      ...input.manifest,
      executionPriceProtocol: runConfig.executionPriceProtocol,
      runConfigChecksum: hashCanonicalManifest(runConfig),
    };
    const rows = new Map(input.rows);
    const key = [...rows.keys()].find((value) => value.endsWith('/execution/bars.parquet'))!;
    const equalRows = new Map(rows);
    equalRows.set(
      key,
      rows
        .get(key)!
        .map((row) =>
          row.occurredAt === valuationAt ? { ...row, availableAt: valuationAt! } : row,
        ),
    );
    expect(
      benchmarkMetric(
        buildBacktestV3Benchmark({ ...input, runConfig, manifest, rows: equalRows }),
        'totalReturn',
      ).status,
    ).toBe('available');
    const bars = rows
      .get(key)!
      .map((row) =>
        row.occurredAt === valuationAt
          ? { ...row, availableAt: valuationAt!.replace(/\.000Z$/, '.000001Z') }
          : row,
      );
    expect(
      bars.some((row) => row.availableAt === valuationAt!.replace(/\.000Z$/, '.000001Z')),
    ).toBe(true);
    rows.set(key, bars);
    const projection = buildBacktestV3Benchmark({ ...input, runConfig, manifest, rows });
    expect(benchmarkMetric(projection, 'totalReturn').status).toBe('unavailable');
    expect(projection.warnings).toContain('BENCHMARK_ALIGNMENT_INCOMPLETE');
  });

  it('以完整冻结输入重复计算得到确定结果，并严格解析兼容报告和指标', async () => {
    const { input } = await setup('proportional');
    const first = buildBacktestV3Benchmark(input);
    expect(buildBacktestV3Benchmark(input)).toEqual(first);
    const changedCapital = runConfigSchemaV3.parse({
      ...input.runConfig,
      initialCash: { ...input.runConfig.initialCash, CNY: '1000001' },
    });
    const changedCapitalProjection = buildBacktestV3Benchmark({
      ...input,
      runConfig: changedCapital,
      manifest: {
        ...input.manifest,
        runConfigChecksum: hashCanonicalManifest(changedCapital),
      },
    });
    expect(changedCapitalProjection.benchmarkCompatibility.benchmarkFingerprint).not.toBe(
      first.benchmarkCompatibility.benchmarkFingerprint,
    );
    expect(backtestBenchmarkCompatibilitySchemaV3.parse(first.benchmarkCompatibility)).toEqual(
      first.benchmarkCompatibility,
    );
    expect(backtestMetricSchema.parse(benchmarkMetric(first, 'totalReturn'))).toEqual(
      benchmarkMetric(first, 'totalReturn'),
    );
    expect(backtestMetricSchema.parse(benchmarkMetric(first, 'excessReturn'))).toEqual(
      benchmarkMetric(first, 'excessReturn'),
    );
    expect(() =>
      buildBacktestV3Benchmark({
        ...input,
        runConfig: { ...input.runConfig, injected: true } as RunConfigV3,
      }),
    ).toThrow();
    expect(() =>
      buildBacktestV3Benchmark({
        ...input,
        manifest: { ...input.manifest, strategyVersionHash: '0'.repeat(64) },
      }),
    ).toThrow(/strategyVersionHash/);
    expect(() =>
      buildBacktestV3Benchmark({
        ...input,
        manifest: {
          ...input.manifest,
          executionModel: {
            ...input.manifest.executionModel!,
            contentHash: '0'.repeat(64),
          },
        },
      }),
    ).toThrow(/execution model 引用/);
  });
});
