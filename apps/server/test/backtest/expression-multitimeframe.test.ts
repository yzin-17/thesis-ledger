import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { priceResearchFixture } from './price-research.fixtures.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import {
  readAdditionalSignalPricesV3,
  validateAdditionalSignalPricesV3,
} from '../../src/backtest/backtest-signal-price-inputs-v3.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

import { multitimeframeFixture as fixture } from './expression-multitimeframe.fixture.js';
import { planBacktestPriceInputs } from '../../src/backtest/backtest-dependency-price.js';
import { additionalSignalPricePlanV3 } from '../../src/backtest/backtest-signal-price-plan-v3.js';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import { expressionModelSnapshot } from './strategy-expression-model-snapshot.fixture.js';

it.each(['1d', '60m'] as const)(
  '%s 主周期与额外来源各自冻结，断开来源后 Runner 完整重复回放一致',
  async (timeframe) => {
    const f = await fixture(timeframe);
    const root = await mkdtemp(join(tmpdir(), 'expression-multitimeframe-'));
    roots.push(root);
    const snapshots = new LocalSnapshotStore(root);
    const built = await new DsaSnapshotBuilder(f.dsa as never, snapshots, f.reader).buildV3(
      f.input,
    );
    expect(
      built.manifest.actualSources.some(
        (source) =>
          source.purpose === 'signal' &&
          source.routeKey.kind === 'bar' &&
          source.routeKey.timeframe === (timeframe === '1d' ? '1m' : '1d'),
      ),
    ).toBe(true);
    expect(
      built.artifactRefs.some(
        (ref) => ref.key.includes('/signal/') && ref.key.endsWith('.evidence.parquet'),
      ),
    ).toBe(true);
    f.reader.readV3.mockImplementation(async () => {
      throw new Error('冻结后不得读新来源');
    });
    const input = {
      runId: f.input.runId,
      snapshotRef: built.snapshotRef,
      artifactRefs: built.artifactRefs,
    };
    const result = await new LocalSnapshotV3Runner(snapshots).run(
      input,
      new AbortController().signal,
    );
    expect(result.simulationFills.some((fill) => fill.side === 'buy')).toBe(true);
    expect(result.simulationFills[0]!.occurredAt.slice(0, 10)).toBe(
      timeframe === '1d' ? '2026-05-19' : '2026-05-18',
    );
    expect(
      await new LocalSnapshotV3Runner(new LocalSnapshotStore(root)).run(
        input,
        new AbortController().signal,
      ),
    ).toEqual(result);
  },
  30_000,
);

it('额外周期没有准备身份时拒绝构建，窗口身份变化也不自动读取新版本', async () => {
  const f = await fixture();
  const root = await mkdtemp(join(tmpdir(), 'expression-multitimeframe-'));
  roots.push(root);
  const snapshots = new LocalSnapshotStore(root);
  const originalRef = f.input.runConfig.signalPriceWindows![0]!.frozenWindowRef;
  delete f.input.runConfig.signalPriceWindows;
  await expect(
    new DsaSnapshotBuilder(f.dsa as never, snapshots, f.reader).buildV3(f.input),
  ).rejects.toThrow('尚未准备冻结窗口');
  const read = f.reader.readV3.getMockImplementation()!;
  f.reader.readV3.mockImplementation(async (request) => {
    const result = await read(request);
    if (result.status === 'selected' && request.routeKey.timeframe === '1m')
      result.frozenWindowRef = originalRef;
    return result;
  });
  f.input.runConfig.signalPriceWindows = [
    {
      artifactKey: 'signal/CN-159516.SZ-1m-qfq.parquet',
      frozenWindowRef: {
        version: 'market-frozen-window-v1',
        identityFingerprint: 'b'.repeat(64),
        responseHash: 'c'.repeat(64),
      },
    },
  ];
  await expect(
    new DsaSnapshotBuilder(f.dsa as never, snapshots, f.reader).buildV3(f.input),
  ).rejects.toThrow('身份与准备记录不一致');
});

it('正式准备独立获取并回传额外周期身份，构建与执行只使用该冻结版本', async () => {
  const f = await fixture();
  const research = await priceResearchFixture();
  const implementation = f.reader.readV3.getMockImplementation()!;
  f.reader.readV3.mockImplementation(async (request) => {
    try {
      return await implementation(request);
    } catch (error) {
      console.info('受控Reader错误', String(error));
      throw error;
    }
  });
  const prepared = await prepareBacktestRunConfigV3({
    request: research.request,
    strategy: f.input.strategy,
    reader: f.reader,
    control: research.control,
    checkedAt: f.input.runConfig.dataAsOf,
    researchCalendar: f.researchCalendar,

  });
  expect(prepared.status, JSON.stringify(prepared)).toBe('prepared');
  if (prepared.status !== 'prepared') throw new Error('正式准备失败');
  expect(prepared.runConfig.signalPriceWindows?.[0]?.artifactKey).toBe(
    'signal/CN-159516.SZ-1m-hfq.parquet',
  );
  f.input.runConfig = prepared.runConfig;
  f.input.executionRouteKey.adjustment = 'hfq';
  const root = await mkdtemp(join(tmpdir(), 'expression-multitimeframe-'));
  roots.push(root);
  const snapshots = new LocalSnapshotStore(root);
  const built = await new DsaSnapshotBuilder(research.dsa as never, snapshots, f.reader).buildV3(
    f.input,
  );
  expect(
    f.reader.readV3.mock.calls.some(
      ([request]) => request.routeKey.timeframe === '1m' && request.frozenWindowRef,
    ),
  ).toBe(true);
  f.reader.readV3.mockImplementation(async () => {
    throw new Error('正式冻结后禁止实读');
  });
  const input = {
    runId: f.input.runId,
    snapshotRef: built.snapshotRef,
    artifactRefs: built.artifactRefs,
  };
  expect(
    await new LocalSnapshotV3Runner(snapshots).run(input, new AbortController().signal),
  ).toEqual(await new LocalSnapshotV3Runner(snapshots).run(input, new AbortController().signal));
});

it('额外周期实际预热不足或价格基准未对齐时拒绝，不补默认行情', async () => {
  const f = await fixture();
  delete f.input.runConfig.signalPriceWindows;
  await expect(
    readAdditionalSignalPricesV3({
      strategy: f.input.strategy,
      runConfig: f.input.runConfig,
      reader: f.reader,
      warmupStart: f.input.runConfig.startDate,
      requireFrozen: false,
    }),
  ).rejects.toThrow('实际预热观测');
  const read = f.reader.readV3.getMockImplementation()!;
  f.reader.readV3.mockImplementation(async (request) => {
    const result = await read(request);
    if (result.status === 'selected' && request.routeKey.timeframe === '1m') {
      result.selection.response.sourcePriceBasis.methodVersion = 'other-unproven-price-base';
      result.evidence.sourcePriceBasis = result.selection.response.sourcePriceBasis;
      result.evidence.completeResponseHash = marketFrozenWindowHashV3(result.selection.response);
    }
    return result;
  });
  await expect(
    readAdditionalSignalPricesV3({
      strategy: f.input.strategy,
      runConfig: f.input.runConfig,
      reader: f.reader,
      warmupStart: '2026-04-01',
      requireFrozen: false,
    }),
  ).rejects.toThrow('价格或成交量口径');
});

it('额外周期证据内容、来源身份或行数据被改写时，冻结回放校验拒绝', async () => {
  const f = await fixture();
  const root = await mkdtemp(join(tmpdir(), 'expression-signal-evidence-'));
  roots.push(root);
  const built = await new DsaSnapshotBuilder(
    f.dsa as never,
    new LocalSnapshotStore(root),
    f.reader,
  ).buildV3(f.input);
  const extra = (
    await readAdditionalSignalPricesV3({
      strategy: f.input.strategy,
      runConfig: f.input.runConfig,
      reader: f.reader,
      warmupStart: built.manifest.dateRange.warmupStartDate,
      requireFrozen: true,
    })
  )[0]!;
  const rows = new Map<string, ArtifactRow[]>([
    [extra.plan.artifactKey, extra.rows],
    [extra.plan.evidenceKey, [extra.evidenceRow]],
  ]);
  const check = () =>
    validateAdditionalSignalPricesV3(f.input.strategy, f.input.runConfig, built.manifest, rows);
  expect(check()).toEqual([extra.actualSource]);
  const original = structuredClone(extra.evidenceRow);
  extra.evidenceRow.sourceFrozenWindowRef = JSON.stringify({
    ...extra.frozenWindowRef,
    identityFingerprint: 'd'.repeat(64),
  });
  expect(check).toThrow('身份或内容不一致');
  Object.assign(extra.evidenceRow, original);
  const oldClose = extra.rows[0]!.close!;
  extra.rows[0]!.close = '999';
  expect(check).toThrow('身份或内容不一致');
  extra.rows[0]!.close = oldClose;
  const response = JSON.parse(String(original.completeResponse));
  response.bars[0].close = 999;
  extra.evidenceRow.completeResponse = JSON.stringify(response);
  expect(check).toThrow();
});

it('额外周期的 ATR 距离计入预热，同一物理周期的别名只冻结一份', async () => {
  const f = await fixture();
  f.input.strategy.tradePlan = {
    version: 1,
    evaluation: 'barClose',
    stages: [],
    initialStop: { kind: 'entryAtr', sourceId: 'hourly', period: 14, multiple: '2' },
  };
  const alias = {
    ...f.input.strategy.signalSources[1]!,
    id: 'hourly-alias',
    timeframe: '30m' as const,
  };
  f.input.strategy.signalSources.push(alias);
  f.input.runConfig.priceInputBindings!.signals.push({
    sourceId: alias.id,
    binding: 'execution-series',
  });
  const plan = additionalSignalPricePlanV3(f.input.strategy, f.input.runConfig);
  expect(plan).toHaveLength(1);
  expect(plan[0]!.minimumWarmupRows).toBe(15 * 60);
  expect(
    planBacktestPriceInputs(f.input.strategy, f.input.runConfig).warmup.lookbackPeriods,
  ).toBeGreaterThanOrEqual(15);
});

it('仅明确选择取得后冻结时推进额外来源截点，严格历史时点继续拒绝晚到数据', async () => {
  const f = await fixture();
  f.input.runConfig.dataAsOf = '2026-05-18T00:00:00Z';
  const input = {
    strategy: f.input.strategy,
    runConfig: f.input.runConfig,
    reader: f.reader,
    warmupStart: '2026-04-01',
    requireFrozen: false,
  };
  await expect(readAdditionalSignalPricesV3(input)).rejects.toThrow('晚于冻结截点');
  await expect(
    readAdditionalSignalPricesV3({ ...input, freezeTimePolicy: 'after-acquisition' }),
  ).resolves.toHaveLength(1);
  await expect(
    readAdditionalSignalPricesV3({
      ...input,
      requireFrozen: true,
      freezeTimePolicy: 'after-acquisition',
    }),
  ).rejects.toThrow('晚于冻结截点');
});

it('模型验收的多周期夹具也走正式准备与独立冻结，保持实际定义并完整重复回放', async () => {
  const f = await fixture();
  const root = await mkdtemp(join(tmpdir(), 'expression-model-source-'));
  roots.push(root);
  const expected = structuredClone(f.input.strategy);
  const snapshot = await expressionModelSnapshot(root, f.input.strategy);
  const result = await snapshot.run();
  expect(snapshot.fixture.input.strategy).toEqual(expected);
  expect(result.simulationFills[0]?.occurredAt.slice(0, 10)).toBe('2026-05-19');
  expect(await snapshot.run()).toEqual(result);
});
