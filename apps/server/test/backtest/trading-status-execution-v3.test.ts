import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { statusCompositionArtifactKeyV1 } from '@thesis-ledger/schemas';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { readSnapshotStatusCompositionV1 } from '../../src/backtest/backtest-status-composition-v1.js';
import { prepareTradingStatusExecutionV3 } from '../../src/backtest/backtest-trading-status-execution-v3.js';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import { statusExecutionFixture } from './trading-status-execution-fixtures.js';

const directories: string[] = [];
afterEach(async () =>
  Promise.all(directories.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);
const setup = async (options?: Parameters<typeof statusExecutionFixture>[1]) => {
  const root = await mkdtemp(join(tmpdir(), 'status-execution-'));
  directories.push(root);
  const state = await statusExecutionFixture(root, options);
  const run = {
    runId: state.input.runId,
    snapshotRef: state.built.snapshotRef,
    artifactRefs: state.built.artifactRefs,
  };
  const runner = new LocalSnapshotV3Runner(state.snapshots);
  const execute = () => runner.run(run, new AbortController().signal);
  return { ...state, run, execute };
};
const readRows = async (state: Awaited<ReturnType<typeof setup>>) => {
  const rows = new Map<string, ArtifactRow[]>();
  for (const ref of state.built.artifactRefs) {
    const values: ArtifactRow[] = [];
    for await (const row of await state.snapshots.artifacts.openRead(ref)) values.push(row);
    rows.set(ref.key, values);
  }
  return rows;
};

describe('停复牌快照创建与现有执行约束', () => {
  it('已知停牌拒单，原价格与模型身份不变且离线复用', async () => {
    const state = await setup();
    const { input, built, dsa, status, snapshots, builder, fixture, originalConfig } = state;
    expect(built.manifest.statusComposition?.artifactKey).toBe(
      `${input.runId}/${statusCompositionArtifactKeyV1}`,
    );
    expect(built.manifest.benchmarkCostVersion).toBe('execution-model-cost-v1');
    expect(built.manifest.runConfigChecksum).toBe(hashCanonicalManifest(originalConfig));
    expect(built.manifest.executionModel?.contentHash).toBe(
      hashCanonicalManifest(originalConfig.executionModel),
    );
    expect(input.runConfig).toEqual(originalConfig);
    expect(status.post).toHaveBeenCalledOnce();
    expect(status.post.mock.calls[0]![1]).toMatchObject({
      range: { start: '2023-08-16', end: '2023-08-21' },
    });
    const rows = await readRows(state);
    const key = `${input.runId}/execution/bars.parquet`;
    const prices = structuredClone(rows.get(key)!);
    const view = prepareTradingStatusExecutionV3(built.manifest, input.runConfig, rows);
    expect(rows.get(key)).toEqual(prices);
    expect(prices.every((row) => row.suspended === undefined)).toBe(true);
    expect(
      view.executionRows.get(key)?.find((row) => String(row.occurredAt).startsWith('2023-08-17'))
        ?.suspended,
    ).toBe(true);
    expect(
      view.executionRows.get(key)?.find((row) => String(row.occurredAt).startsWith('2023-08-18'))
        ?.suspended,
    ).toBeUndefined();
    status.post.mockRejectedValue(new Error('离线禁止读取状态'));
    dsa.effectiveControlPolicyV3.mockRejectedValue(new Error('离线禁止选源'));
    fixture.reader.readV3.mockClear();
    expect((await builder.buildV3(input)).snapshotRef).toEqual(built.snapshotRef);
    const result = await state.execute();
    expect(result.simulationFills.some((fill) => fill.occurredAt.startsWith('2023-08-17'))).toBe(
      false,
    );
    expect(result.rejectedOrders.some((order) => order.message.includes('停牌'))).toBe(true);
    expect(result.simulationFills).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.includes('停牌规则采用 1 日'))).toBe(true);
    expect(result.benchmark?.totalReturn?.status).toBe('available');
    expect(result.completeness).toBe('unavailable');
    expect(await state.execute()).toEqual(result);
    expect(status.post).toHaveBeenCalledOnce();
    expect(dsa.effectiveControlPolicyV3).toHaveBeenCalledTimes(4);
    expect(fixture.reader.readV3).not.toHaveBeenCalled();
    expect((await snapshots.v3.replay(input.runId)).contentHash).toBe(built.manifest.contentHash);
  });

  it('复牌与 unknown 不清除已有行情约束', async () => {
    const state = await setup();
    const rows = await readRows(state);
    const key = `${state.input.runId}/execution/bars.parquet`;
    const prior = new Map(rows);
    prior.set(
      key,
      rows
        .get(key)!
        .map((row) =>
          ['2023-08-16', '2023-08-18'].includes(String(row.occurredAt).slice(0, 10))
            ? { ...row, suspended: true }
            : row,
        ),
    );
    const view = prepareTradingStatusExecutionV3(
      state.built.manifest,
      state.input.runConfig,
      prior,
    );
    for (const date of ['2023-08-16', '2023-08-18'])
      expect(
        view.executionRows.get(key)?.find((row) => String(row.occurredAt).startsWith(date))
          ?.suspended,
      ).toBe(true);
    expect(rows.get(key)?.every((row) => row.suspended === undefined)).toBe(true);
  });

  it('已知停牌但无 Bar 时不补价，按原下一有效开盘规则成交', async () => {
    const state = await setup({ missingBar: true });
    const rows = await readRows(state);
    const key = `${state.input.runId}/execution/bars.parquet`;
    const view = prepareTradingStatusExecutionV3(state.built.manifest, state.input.runConfig, rows);
    expect(view.executionRows.get(key)).toHaveLength(rows.get(key)!.length);
    expect(
      view.executionRows.get(key)?.some((row) => String(row.occurredAt).startsWith('2023-08-17')),
    ).toBe(false);
    const result = await state.execute();
    expect(result.simulationFills.some((fill) => fill.occurredAt.startsWith('2023-08-17'))).toBe(
      false,
    );
    expect(result.simulationFills.some((fill) => fill.occurredAt.startsWith('2023-08-18'))).toBe(
      true,
    );
    expect(await state.execute()).toEqual(result);
  });

  it('复牌日产生的新信号仍按原下一有效开盘规则成交', async () => {
    const state = await setup({ startDate: '2023-08-18' });
    const result = await state.execute();
    expect(result.rejectedOrders).toHaveLength(0);
    expect(result.simulationFills).toHaveLength(1);
    expect(result.simulationFills[0]?.occurredAt.startsWith('2023-08-21')).toBe(true);
  });

  it('全窗 unknown 仍按已选价格假设运行，不以未知补成正常或逐日选源', async () => {
    const state = await setup({ source: 'unknown' });
    const result = await state.execute();
    const rows = await readRows(state);
    const frozen = readSnapshotStatusCompositionV1(state.built.manifest, state.input.runConfig,
      rows.get(state.built.manifest.statusComposition!.artifactKey)!);
    expect(frozen?.adoption.suspendedDates).toEqual([]);
    expect(frozen?.composition.entries[0]).toMatchObject({ status: 'included',
      result: { days: expect.arrayContaining([expect.objectContaining({ state: 'unknown' })]) } });
    expect(result.simulationFills.some((fill) => fill.occurredAt.startsWith('2023-08-17'))).toBe(
      true,
    );
    expect(state.status.post).toHaveBeenCalledOnce();
    expect(result.rejectedOrders.some((order) => order.message.includes('停牌'))).toBe(false);
  });

  it.each(['failed', 'unconfigured'] as const)(
    '%s 状态来源时冻结未纳入原因，不阻断普通研究',
    async (source) => {
      const state = await setup({ source });
      const result = await state.execute();
      const baseline = await setup({ source: 'unknown' });
      const baselineResult = await baseline.execute();
      if (source === 'failed') expect(result.warnings.some((warning) => warning.includes('可选失败 1 项'))).toBe(true);
      else expect(state.built.manifest.statusComposition).toBeUndefined();
      expect(result.tradingStatusDisclosure).toBeUndefined();
      expect(result.simulationFills.some((fill) => fill.occurredAt.startsWith('2023-08-17'))).toBe(
        true,
      );
      expect(result.metrics).toEqual(baselineResult.metrics);
      expect(result.benchmark).toEqual(baselineResult.benchmark);
      expect(result.completeness).toBe(baselineResult.completeness);
    },
  );

  it('执行窗口从停牌日开始时，基准首末买卖对齐不使用停牌报价', async () => {
    const state = await setup({ startDate: '2023-08-17' });
    const rows = await readRows(state);
    const key = `${state.input.runId}/execution/bars.parquet`;
    const view = prepareTradingStatusExecutionV3(state.built.manifest, state.input.runConfig, rows);
    expect(
      view.benchmarkRows.get(key)?.some((row) => String(row.occurredAt).startsWith('2023-08-17')),
    ).toBe(false);
    const result = await state.execute();
    expect(result.benchmark?.totalReturn?.status).toBe('available');
    expect(result.benchmarkCompatibility?.costAssumption.kind).toBe('execution-model');
    expect(result.simulationFills.some((fill) => fill.occurredAt.startsWith('2023-08-17'))).toBe(
      false,
    );
  });

  it.each([
    {
      legacyCost: false,
      benchmarkStatus: 'available',
    },
    {
      legacyCost: true,
      benchmarkStatus: 'unavailable',
    },
  ])('无状态引用的旧快照在当前引擎保持输入与计算内容：成本旧版 $legacyCost', async (expected) => {
    const state = await setup({ legacy: true, legacyCost: expected.legacyCost });
    expect(state.built.manifest.tradingStatus).toBeUndefined();
    expect(state.built.manifest.benchmarkCostVersion).toBe(
      expected.legacyCost ? undefined : 'execution-model-cost-v1',
    );
    const result = await state.execute();
    expect(result.tradingStatusDisclosure).toBeUndefined();
    const { resultChecksum, ...payload } = result;
    expect(payload.engineVersion).toBe(new LocalSnapshotV3Runner(state.snapshots).id);
    expect(payload.contentHash).toBe(state.built.manifest.contentHash);
    expect(resultChecksum).toBe(deterministicResultChecksum(payload));
    expect(result.benchmark?.totalReturn?.status).toBe(expected.benchmarkStatus);
    expect(result.simulationFills[0]?.occurredAt.startsWith('2023-08-17')).toBe(true);
    const withNewSource = new DsaSnapshotBuilder(
      state.dsa as unknown as DsaClient,
      state.snapshots,
      state.fixture.reader,
    );
    expect((await withNewSource.buildV3(state.input)).snapshotRef).toEqual(state.built.snapshotRef);
    expect(state.status.post).not.toHaveBeenCalled();
    expect(state.dsa.effectiveControlPolicyV3).not.toHaveBeenCalled();
    expect(await state.execute()).toEqual(result);
  });
});
