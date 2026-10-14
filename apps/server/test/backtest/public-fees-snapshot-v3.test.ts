import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DecimalValue,
  calculateExecutionModelFees,
  resolveNormalizedExecutionModelSegment,
} from '@thesis-ledger/domain';
import type { FrozenExecutionModel } from '@thesis-ledger/domain';
import { publicFeesArtifactKeyV3, type MarketPublicFeesRequestV3 } from '@thesis-ledger/schemas';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { hashCanonicalManifest, LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { combinePublicFeesExecutionModelV3 } from '../../src/backtest/backtest-public-fees-model-v3.js';
import { collectSnapshotPublicFeesV3 } from '../../src/backtest/backtest-public-fees-snapshot-v3.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';
import { publicFeeInputs } from './public-fees-fixtures.js';

const directories: string[] = [];
afterEach(async () =>
  Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))),
);

const setup = async (failure: boolean | 'primary' | 'incompatible' = false, backup = false) => {
  const fixture = await completeSnapshotFixture();
  const { fees } = await publicFeeInputs();
  const { fees: archiveFees } = await publicFeeInputs(true);
  const { input } = fixture;
  const model = input.runConfig.executionModel!;
  input.runConfig.startDate = fees.range.start;
  input.runConfig.endDate = fees.range.end;
  model.scope = { ...model.scope, symbol: fees.symbol, instrumentType: 'STOCK', range: fees.range };
  model.segments.forEach((segment) => {
    segment.range = fees.range;
  });
  input.strategy.executionInstrument = {
    ...input.strategy.executionInstrument,
    symbol: fees.symbol,
    assetType: 'stock',
  };
  input.strategy.signalSources.forEach((source) => {
    source.asset = { ...source.asset, symbol: fees.symbol, assetType: 'stock' };
  });
  input.executionRouteKey.assetType = 'STOCK';
  input.strategyVersionHash = hashCanonicalManifest(input.strategy);
  const originalFacts = fixture.dsa.backtestInstrumentFacts.getMockImplementation()!;
  fixture.dsa.backtestInstrumentFacts.mockImplementation(async (request) => {
    const response = await originalFacts(request);
    if (!request.identityOnly) {
      const bars = await makeReaderResult({
        symbol: request.symbol,
        market: request.market,
        routeKey: { ...input.executionRouteKey, adjustment: request.barAdjustment ?? 'qfq' },
        window: { start: request.start, end: request.end },
      });
      if (bars.status !== 'selected') throw new Error('合成行情不可用');
      response.historicalTradability = tradabilityFixtureV3(
        tradabilityWindowFromResponseV3(bars.selection.response),
      );
    }
    return response;
  });
  const marketPublicFeesV3 = vi.fn(async (request: MarketPublicFeesRequestV3) => {
    if (failure === true || (failure === 'primary' && request.routeTarget.routeIndex === 0))
      throw new Error('模拟來源不可用');
    if (failure === 'incompatible' && request.routeTarget.routeIndex === 0)
      return { ...fees, ...request, segments: [fees.segments[0]!] };
    return { ...(request.routeTarget.routeIndex === 0 ? fees : archiveFees), ...request };
  });
  const effectiveControlPolicyV3 = vi.fn(async () => ({
    projection: {
      effective: {
        enabled: true,
        routes: [
          {
            key: fees.routeKey,
            targets: (backup ? [fees, archiveFees] : [fees]).map((value) => ({
              ...value.routeTarget,
              eligible: true,
              reason: null as string | null,
            })),
          },
        ],
      },
    },
  }));
  const dsa = { ...fixture.dsa, marketPublicFeesV3, effectiveControlPolicyV3 };
  const root = await mkdtemp(join(tmpdir(), 'public-fees-snapshot-'));
  directories.push(root);
  const snapshots = new LocalSnapshotStore(root);
  const builder = new DsaSnapshotBuilder(dsa as unknown as DsaClient, snapshots, fixture.reader);
  const originalHash = hashCanonicalManifest(input.runConfig);
  const built = await builder.buildV3(input);
  return { input, fees, model, dsa, snapshots, builder, built, originalHash };
};

describe('公共收费完整快照与离线执行', () => {
  it('主源不 eligible 时只读取已配置备用，缺少备用时保留组合失败原因', async () => {
    const { input, dsa, fees } = await setup();
    const { fees: archiveFees } = await publicFeeInputs(true);
    dsa.effectiveControlPolicyV3.mockResolvedValue({
      projection: {
        effective: {
          enabled: true,
          routes: [
            {
              key: archiveFees.routeKey,
              targets: [
                { ...fees.routeTarget, eligible: false, reason: '主源不可用' },
                { ...archiveFees.routeTarget, eligible: true, reason: null },
              ],
            },
          ],
        },
      },
    });
    dsa.marketPublicFeesV3.mockClear();
    const selected = await collectSnapshotPublicFeesV3(
      input.runConfig,
      dsa as unknown as DsaClient,
    );
    expect(selected?.disclosure.status).toBe('source');
    expect(dsa.marketPublicFeesV3).toHaveBeenCalledTimes(1);
    expect(dsa.marketPublicFeesV3.mock.calls[0]![0].routeTarget.routeIndex).toBe(1);
    const incompatible = await setup('incompatible');
    const fallback = await collectSnapshotPublicFeesV3(
      incompatible.input.runConfig,
      incompatible.dsa as unknown as DsaClient,
    );
    expect(fallback?.disclosure).toEqual({
      status: 'executionModel',
      reason: '公共收费与已选模型的范围或金额设置不兼容，使用已选执行模型。',
    });
  });
  it.each(['primary', 'incompatible'] as const)(
    '%s 主源不可用时整窗冻结实际备用包，离线运行保留回退原因',
    async (failure) => {
      const { input, fees, dsa, snapshots, built } = await setup(failure, true);
      expect(dsa.marketPublicFeesV3).toHaveBeenCalledTimes(2);
      expect(dsa.marketPublicFeesV3.mock.calls.map(([request]) => request.range)).toEqual([
        fees.range,
        fees.range,
      ]);
      dsa.marketPublicFeesV3.mockRejectedValue(new Error('离线不得读取来源'));
      const run = {
        runId: input.runId,
        snapshotRef: built.snapshotRef,
        artifactRefs: built.artifactRefs,
      };
      const runner = new LocalSnapshotV3Runner(snapshots);
      const result = await runner.run(run, new AbortController().signal);
      expect(result.publicFeesDisclosure?.status).toBe('source');
      if (result.publicFeesDisclosure?.status !== 'source') throw new Error('备用未冻结');
      expect(result.publicFeesDisclosure.response.provenance.upstreamSource).toBe(
        'cn-stock-auction-fees-archive',
      );
      expect(result.publicFeesDisclosure.response.routeTarget.routeIndex).toBe(1);
      expect(result.publicFeesDisclosure.fallbackReason).toContain('整段区间');
      expect(
        result.publicFeesDisclosure.response.sourceDocuments.some(
          (item) => item.id === 'handling-2023-136',
        ),
      ).toBe(false);
      expect(await runner.run(run, new AbortController().signal)).toEqual(result);
      expect(dsa.marketPublicFeesV3).toHaveBeenCalledTimes(2);
    },
  );

  it('主源成功不双读，两源失败冻结已选模型', async () => {
    const main = await setup(false, true);
    expect(main.dsa.marketPublicFeesV3).toHaveBeenCalledTimes(1);
    const { input, dsa, snapshots, built } = await setup(true, true);
    const result = await new LocalSnapshotV3Runner(snapshots).run(
      { runId: input.runId, snapshotRef: built.snapshotRef, artifactRefs: built.artifactRefs },
      new AbortController().signal,
    );
    expect(result.publicFeesDisclosure?.status).toBe('executionModel');
    expect(dsa.marketPublicFeesV3).toHaveBeenCalledTimes(2);
    expect(result.simulationFills.length).toBeGreaterThan(0);
  });
  it('整窗只读取一次，原模型身份不变，Runner/基准消费冻结结果且重放不请求 DSA', async () => {
    const { input, model, fees, dsa, snapshots, builder, built, originalHash } = await setup();
    expect(dsa.marketPublicFeesV3).toHaveBeenCalledTimes(1);
    expect(dsa.marketPublicFeesV3.mock.calls[0]![0].range).toEqual(fees.range);
    expect(built.manifest.runConfigChecksum).toBe(originalHash);
    expect(built.manifest.executionModel?.contentHash).toBe(hashCanonicalManifest(model));
    expect(built.manifest.publicFees?.artifactKey).toBe(
      `${input.runId}/${publicFeesArtifactKeyV3}`,
    );
    dsa.marketPublicFeesV3.mockRejectedValue(new Error('离线重放禁止请求收费源'));
    dsa.effectiveControlPolicyV3.mockRejectedValue(new Error('离线重放禁止请求策略'));
    const reused = await builder.buildV3(input);
    expect(reused.snapshotRef).toEqual(built.snapshotRef);
    const runner = new LocalSnapshotV3Runner(snapshots);
    const run = {
      runId: input.runId,
      snapshotRef: built.snapshotRef,
      artifactRefs: built.artifactRefs,
    };
    const result = await runner.run(run, new AbortController().signal);
    expect(result).toEqual(await runner.run(run, new AbortController().signal));
    expect(dsa.marketPublicFeesV3).toHaveBeenCalledTimes(1);
    expect(dsa.effectiveControlPolicyV3).toHaveBeenCalledTimes(1);
    expect(result.publicFeesDisclosure?.status).toBe('source');
    expect(result.executionModelDisclosure?.contentHash).toBe(hashCanonicalManifest(model));
    expect(built.manifest.benchmarkCostVersion).toBe('execution-model-cost-v1');
    expect(result.benchmarkCompatibility?.costAssumption.kind).toBe('execution-model');
    expect(result.benchmark?.totalReturn?.status).toBe('available');
    expect(result.benchmark?.excessReturn?.status).toBe('available');
    expect(result.executionPriceProtocol.history.basis).toBe('fixed-provider-snapshot');
    expect(result.warnings).toContain(
      '费用已使用冻结公共费率；佣金及金额设置沿用已选模型，历史首次可见时钟未验证。',
    );
    expect(result.completeness).toBe('complete');
    expect(result.simulationFills.length).toBeGreaterThan(0);
    const combined = combinePublicFeesExecutionModelV3(model, fees);
    for (const fill of result.simulationFills) {
      const segment = resolveNormalizedExecutionModelSegment(
        combined as unknown as FrozenExecutionModel,
        {
          expectedVersion: combined.version,
          symbol: fees.symbol,
          market: 'CN',
          instrumentType: 'STOCK',
          currency: 'CNY',
          evaluatedAt: fill.occurredAt,
          dataAsOf: input.runConfig.dataAsOf,
        },
      );
      const turnover = DecimalValue.from(fill.price).times(fill.quantity).toString();
      const expected = calculateExecutionModelFees(segment.fees, {
        side: fill.side,
        turnover,
        currency: 'CNY',
      });
      const actual = fill.charges
        .reduce((sum, item) => sum.plus(item.amount), DecimalValue.from('0'))
        .toString();
      expect(actual).toBe(expected.total);
    }
    expect(hashCanonicalManifest(input.runConfig)).toBe(originalHash);
  });

  it('收费源失败仍运行已选模型，冻结并披露原因，重放不再尝试来源', async () => {
    const { input, dsa, snapshots, built } = await setup(true);
    const result = await new LocalSnapshotV3Runner(snapshots).run(
      { runId: input.runId, snapshotRef: built.snapshotRef, artifactRefs: built.artifactRefs },
      new AbortController().signal,
    );
    expect(result.publicFeesDisclosure).toEqual({
      status: 'executionModel',
      reason: '公共收费源暂不可用，使用已选执行模型。',
    });
    expect(result.warnings).toContain('公共收费源暂不可用，使用已选执行模型。');
    expect(dsa.marketPublicFeesV3).toHaveBeenCalledTimes(1);
  });
});
