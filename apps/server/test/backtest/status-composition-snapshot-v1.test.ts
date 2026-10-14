import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  effectiveProviderPolicyV3Schema,
  statusCompositionArtifactKeyV1,
} from '@thesis-ledger/schemas';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { prepareTradingStatusExecutionV3 } from '../../src/backtest/backtest-trading-status-execution-v3.js';
import { readSnapshotStatusCompositionV1, collectSnapshotStatusInputsV1 } from '../../src/backtest/backtest-status-composition-v1.js';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import { statusExecutionFixture } from './trading-status-execution-fixtures.js';
import { compositionFixture } from '../market/status-composition-fixtures.js';

const directories: string[] = [];
afterEach(async () =>
  Promise.all(directories.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);
async function setup(datesOnly = false, sampledClock = false) {
  const root = await mkdtemp(join(tmpdir(), 'status-composition-'));
  directories.push(root);
  const state = await statusExecutionFixture(root);
  const c = compositionFixture({
    symbol: '000995.SZ',
    dates: ['2023-08-16', '2023-08-17', '2023-08-18', '2023-08-21'],
    riskFailure: true,
  });
  const old = await state.dsa.effectiveControlPolicyV3();
  if (datesOnly)
    c.policy.routes = c.policy.routes.filter(
      (route) => route.key.capability === 'SECURITY_BASIC_DATES',
    );
  const oldRoutes = old.projection.effective.routes.map((route) => ({
    ...route,
    enabled: true,
    reason: null,
  }));
  c.policy.routes.push(
    ...effectiveProviderPolicyV3Schema.parse({ ...c.policy, routes: oldRoutes }).routes,
  );
  state.dsa.marketTradingStatusV3.mockClear();
  let sampling = 0;
  if (sampledClock) c.readPolicy.mockImplementation(async () => ({ ...structuredClone(c.policy),
    appliedAt: new Date(Date.parse(c.policy.appliedAt) + ++sampling).toISOString() }));
  const dsa = {
    ...state.dsa,
    dataCapabilities: c.reader,
    effectiveControlPolicyV3: vi.fn(async () => ({
      projection: { effective: { ...structuredClone(c.policy), ...(sampledClock ? {
        appliedAt: new Date(Date.parse(c.policy.appliedAt) + ++sampling).toISOString(),
      } : {}) } },
    })),
  };
  const input = { ...state.input, runId: 'composition-run' };
  const builder = new DsaSnapshotBuilder(
    dsa as unknown as DsaClient,
    state.snapshots,
    state.fixture.reader,
  );
  const built = await builder.buildV3(input);
  const rows = new Map<string, ArtifactRow[]>();
  for (const ref of built.artifactRefs) {
    const values: ArtifactRow[] = [];
    for await (const row of await state.snapshots.artifacts.openRead(ref)) values.push(row);
    rows.set(ref.key, values);
  }
  const runner = new LocalSnapshotV3Runner(state.snapshots);
  const execute = () =>
    runner.run(
      { runId: input.runId, snapshotRef: built.snapshotRef, artifactRefs: built.artifactRefs },
      new AbortController().signal,
    );
  return { ...state, c, dsa, input, builder, built, rows, runner, execute, oldBuilt: state.built };
}

describe('新组合经现有快照产物和离线执行闭环', () => {
  it('原Builder各次政策采样时间变化仍冻结完整组合，离线重复结果保持', async () => {
    const s = await setup(false, true);
    const key = `${s.input.runId}/${statusCompositionArtifactKeyV1}`;
    const frozen = readSnapshotStatusCompositionV1(s.built.manifest, s.input.runConfig, s.rows.get(key)!);
    expect(frozen?.composition.entries).toHaveLength(5);
    expect(frozen?.composition.policy.appliedAt).not.toBe(s.c.policy.appliedAt);
    expect(s.c.post).toHaveBeenCalledTimes(5);
    s.c.post.mockRejectedValue(new Error('离线禁止来源'));
    s.c.readPolicy.mockRejectedValue(new Error('离线禁止控制'));
    s.dsa.effectiveControlPolicyV3.mockRejectedValue(new Error('离线禁止控制'));
    expect(await s.execute()).toEqual(await s.execute());
  });
  it.each([2, 4])('第%s次控制读取的真实操作身份变化仍阻断冻结', async (changeAt) => {
    const s = await setup();
    let reads = 0;
    s.dsa.effectiveControlPolicyV3.mockImplementation(async () => ({ projection: {
      effective: { ...structuredClone(s.c.policy), ...(++reads >= changeAt ? { requestId: 'changed-operation' } : {}) },
    } }));
    await expect(collectSnapshotStatusInputsV1(s.input.runConfig, s.dsa as unknown as DsaClient))
      .rejects.toMatchObject({ code: 'stale-revision', message: changeAt === 2 ? '冻结前独立功能选择变化' : '冻结状态读取期间政策变化' });
  });
  it('仅选择基础日期仍保留原交易状态约束，没有重复读取', async () => {
    const s = await setup(true);
    expect(s.built.manifest.statusComposition).toBeDefined();
    expect(s.built.manifest.tradingStatus).toBeDefined();
    expect(s.dsa.marketTradingStatusV3).toHaveBeenCalledOnce();
    expect(s.c.post).toHaveBeenCalledOnce();
    const view = prepareTradingStatusExecutionV3(s.built.manifest, s.input.runConfig, s.rows);
    expect(view.suspendedDates).toContain('2023-08-17');
  });
  it('分别冻结可选失败和事实，只采用已知停牌，价格与模型身份不变', async () => {
    const s = await setup();
    const key = `${s.input.runId}/${statusCompositionArtifactKeyV1}`;
    expect(s.built.manifest.statusComposition?.artifactKey).toBe(key);
    expect(s.built.manifest.tradingStatus).toBeUndefined();
    expect(s.dsa.marketTradingStatusV3).not.toHaveBeenCalled();
    expect(s.c.post).toHaveBeenCalledTimes(5);
    const frozen = readSnapshotStatusCompositionV1(
      s.built.manifest,
      s.input.runConfig,
      s.rows.get(key)!,
    );
    expect(frozen?.composition.entries).toHaveLength(5);
    expect(
      frozen?.composition.entries.find((item) => item.query.routeKey.capability === 'RISK_WARNING'),
    ).toMatchObject({ status: 'failed', error: 'unavailable' });
    expect(frozen?.adoption.suspendedDates).toEqual(['2023-08-17']);
    expect(s.built.manifest.runConfigChecksum).toBe(hashCanonicalManifest(s.originalConfig));
    expect(s.built.manifest.executionModel?.contentHash).toBe(
      hashCanonicalManifest(s.originalConfig.executionModel),
    );
    expect(s.input.runConfig).toEqual(s.originalConfig);
    const priceKey = `${s.input.runId}/execution/bars.parquet`,
      prices = structuredClone(s.rows.get(priceKey)!);
    const view = prepareTradingStatusExecutionV3(s.built.manifest, s.input.runConfig, s.rows);
    expect(s.rows.get(priceKey)).toEqual(prices);
    expect(prices.every((row) => row.suspended === undefined)).toBe(true);
    expect(
      view.executionRows
        .get(priceKey)
        ?.find((row) => String(row.occurredAt).startsWith('2023-08-17'))?.suspended,
    ).toBe(true);
    expect(view.compositionWarnings[0]).toContain('可选失败 1 项');
    const reads = s.c.post.mock.calls.length;
    s.c.post.mockRejectedValue(new Error('离线禁止来源'));
    s.c.readPolicy.mockRejectedValue(new Error('离线禁止当前政策'));
    s.dsa.effectiveControlPolicyV3.mockRejectedValue(new Error('离线禁止选源'));
    s.fixture.reader.readV3.mockClear();
    expect((await s.builder.buildV3(s.input)).snapshotRef).toEqual(s.built.snapshotRef);
    const result = await s.execute();
    expect(result.rejectedOrders.some((order) => order.message.includes('停牌'))).toBe(true);
    expect(result.simulationFills.some((fill) => fill.occurredAt.startsWith('2023-08-17'))).toBe(
      false,
    );
    expect(await s.execute()).toEqual(result);
    expect(s.c.post).toHaveBeenCalledTimes(reads);
    expect(s.fixture.reader.readV3).not.toHaveBeenCalled();
    expect((await s.snapshots.v3.replay(s.input.runId)).contentHash).toBe(
      s.built.manifest.contentHash,
    );
    // 同一离线 Runner 仍能重放原冻结，内容哈希及旧引用不变。
    const oldInput = {
      runId: s.oldBuilt.manifest.runId,
      snapshotRef: s.oldBuilt.snapshotRef,
      artifactRefs: s.oldBuilt.artifactRefs,
    };
    const oldResult = await s.runner.run(oldInput, new AbortController().signal);
    expect(oldResult.rejectedOrders.some((order) => order.message.includes('停牌'))).toBe(true);
    expect((await s.snapshots.v3.replay(oldInput.runId)).contentHash).toBe(
      s.oldBuilt.manifest.contentHash,
    );
  });
  it('离线拒绝配置、采用日期、产物身份与窗口错配', async () => {
    const s = await setup(),
      key = `${s.input.runId}/${statusCompositionArtifactKeyV1}`;
    const rows = s.rows.get(key)!;
    const payload = JSON.parse(rows[0]!.payload as string);
    for (const mutate of [
      (raw: typeof payload) => {
        raw.runConfigChecksum = 'a'.repeat(64);
      },
      (raw: typeof payload) => {
        raw.adoption.suspendedDates = [];
      },
      (raw: typeof payload) => {
        raw.composition.entries[0].query.range.start = '2023-08-15';
      },
    ]) {
      const raw = structuredClone(payload);
      mutate(raw);
      expect(() =>
        readSnapshotStatusCompositionV1(s.built.manifest, s.input.runConfig, [
          { ...rows[0], payload: JSON.stringify(raw) },
        ]),
      ).toThrow();
    }
    expect(() =>
      readSnapshotStatusCompositionV1(s.built.manifest, s.input.runConfig, []),
    ).toThrow();
    expect(() =>
      readSnapshotStatusCompositionV1(
        { runId: 'wrong', statusComposition: s.built.manifest.statusComposition },
        s.input.runConfig,
        rows,
      ),
    ).toThrow();
    expect(() =>
      readSnapshotStatusCompositionV1({ runId: s.input.runId }, s.input.runConfig, rows),
    ).toThrow();
    const ref = s.built.artifactRefs.find((artifact) => artifact.key === key)!;
    await expect(
      s.snapshots.artifacts.openRead({ ...ref, contentHash: 'a'.repeat(64) }),
    ).rejects.toThrow();
  });
});
