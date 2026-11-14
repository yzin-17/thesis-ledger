import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { priceResearchReferenceArtifactKey, type BacktestResultV3 } from '@thesis-ledger/schemas';
import { DecimalValue } from '@thesis-ledger/domain';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { validateCompleteSnapshotInputsV3 } from '../../src/backtest/backtest-snapshot-v3-completeness.js';
import { BacktestRunPreparationService } from '../../src/backtest/backtest-run-preparation.service.js';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { priceResearchFixture } from './price-research.fixtures.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('双价格的策略收益研究', () => {
  it('实验预留原价窗口后，纯指标基线仍能冻结并离线重放两套输入', async () => {
    const f = await priceResearchFixture();
    f.input.strategy.signalSources = [{ ...f.input.strategy.signalSources[0]!, id: 'research', priceCoordinate: 'research' }];
    f.input.strategy.entry = { type: 'not', expression: { type: 'positionState', field: 'isOpen' } };
    f.input.strategy.sizing = { type: 'fixedAmount', amount: '400' };
    f.input.strategyVersionHash = hashCanonicalManifest(f.input.strategy);
    const prepared = await prepareBacktestRunConfigV3({
      request: { ...f.request, priceResearchReference: 'freeze' }, strategy: f.input.strategy,
      reader: f.reader as never, control: f.control, checkedAt: '2026-06-07T08:00:00Z',
    });
    expect(prepared.status, JSON.stringify(prepared)).toBe('prepared');
    if (prepared.status !== 'prepared') throw Error('准备未通过');
    expect(prepared.runConfig.priceResearch?.actualPriceWindow).toBeDefined();
    expect(f.reader.readV3.mock.calls.some(([input]) => input.routeKey.adjustment === 'none')).toBe(true);
    const root = await mkdtemp(join(tmpdir(), 'experiment-research-reference-')); roots.push(root);
    const snapshots = new LocalSnapshotStore(root);
    const output = await new DsaSnapshotBuilder(f.dsa as never, snapshots, f.reader as never).buildV3({
      ...f.input, runConfig: prepared.runConfig, executionRouteKey: { ...f.input.executionRouteKey, adjustment: 'hfq' },
    });
    expect(output.manifest.priceResearch?.actualPriceSource).toBeDefined();
    f.reader.readV3.mockRejectedValue(new Error('offline'));
    const result = await new LocalSnapshotV3Runner(snapshots).run({
      runId: f.input.runId, snapshotRef: output.snapshotRef, artifactRefs: output.artifactRefs,
    }, new AbortController().signal);
    expect(result.priceResearch?.protocolVersion).toBe('price-research-v1');
  });
  it('后复权指标零轴条件不要求原价转换或权益证据', async () => {
    const f = await priceResearchFixture();
    f.input.strategy.signalSources = [
      { ...f.input.strategy.signalSources[0]!, id: 'research', priceCoordinate: 'research' },
    ];
    f.input.strategy.entry = {
      type: 'compare',
      operator: 'gt',
      left: {
        type: 'indicator',
        name: 'MACD',
        output: 'macd',
        input: { type: 'series', sourceId: 'research', field: 'close' },
        params: { fastPeriod: 2, slowPeriod: 3, signalPeriod: 2 },
      },
      right: { type: 'constant', value: '0' },
    };
    f.input.strategy.sizing = { type: 'fixedAmount', amount: '400' };
    const prepared = await prepareBacktestRunConfigV3({
      request: f.request,
      strategy: f.input.strategy,
      reader: f.reader as never,
      control: f.control,
      checkedAt: '2026-06-07T08:00:00Z',
    });
    expect(prepared.status, JSON.stringify(prepared)).toBe('prepared');
    expect(f.reader.readV3).toHaveBeenCalledOnce();
    expect(prepared).not.toHaveProperty('actualPriceSource');
  });
  it('原价来源与自身冻结证据不一致时在准备阶段明确阻断', async () => {
    const f = await priceResearchFixture();
    const read = f.reader.readV3.getMockImplementation()!;
    f.reader.readV3.mockImplementation(async (input) => {
      const selected = await read(input);
      if (input.routeKey.adjustment === 'none')
        selected.selection.response.provenance.providerId = 'futu';
      return selected;
    });
    const prepared = await prepareBacktestRunConfigV3({
      request: f.request,
      strategy: f.input.strategy,
      reader: f.reader as never,
      control: f.control,
      checkedAt: '2026-06-07T08:00:00Z',
    });
    expect(prepared.status).toBe('blocked');
    expect(JSON.stringify(prepared)).toContain('Reader');
  });

});

describe("价格研究缩放与单源不变量", () => {
  it.each([
    { type: 'fixedAmount' as const, amount: '400' },
    { type: 'percentOfEquity' as const, percent: '0.1' },
    { type: 'targetWeight' as const, weight: '0.1' },
    { type: 'fixedQuantity' as const, quantity: '100' },
  ])('后复权整体缩放保持 $type 研究权益、费用和收益不变', async (sizing) => {
    const results: BacktestResultV3[] = [];
    for (const researchScale of [1, 10]) {
      const f = await priceResearchFixture({ researchScale });
      f.input.strategy.sizing = sizing;
      f.input.strategyVersionHash = hashCanonicalManifest(f.input.strategy);
      const prepared = await prepareBacktestRunConfigV3({
        request: f.request,
        strategy: f.input.strategy,
        reader: f.reader as never,
        control: f.control,
        checkedAt: '2026-06-07T08:00:00Z',
      });
      if (prepared.status !== 'prepared') throw new Error(JSON.stringify(prepared));
      const root = await mkdtemp(join(tmpdir(), 'research-scale-'));
      roots.push(root);
      const snapshots = new LocalSnapshotStore(root);
      const output = await new DsaSnapshotBuilder(
        f.dsa as never,
        snapshots,
        f.reader as never,
      ).buildV3({
        ...f.input,
        runConfig: prepared.runConfig,
        executionRouteKey: { ...f.input.executionRouteKey, adjustment: 'hfq' },
      });
      results.push(
        await new LocalSnapshotV3Runner(snapshots).run(
          {
            runId: f.input.runId,
            snapshotRef: output.snapshotRef,
            artifactRefs: output.artifactRefs,
          },
          new AbortController().signal,
        ),
      );
    }
    const equalDecimal = (a: string, b: string) => {
      const delta = DecimalValue.from(a).minus(b);
      expect(delta.compareTo('0.000000000000000000000000000001')).toBeLessThan(0);
      expect(delta.compareTo('-0.000000000000000000000000000001')).toBeGreaterThan(0);
    };
    results[0]!.equityCurve.forEach((point, i) =>
      equalDecimal(point.value.amount, results[1]!.equityCurve[i]!.value.amount),
    );
    Object.entries(results[0]!.metrics).forEach(([key, metric]) => {
      const other = results[1]!.metrics[key]!;
      expect(other.status).toBe(metric.status);
      if (metric.value !== undefined && other.value !== undefined)
        equalDecimal(metric.value, other.value);
    });
    results[0]!.simulationFills.forEach((fill, i) =>
      fill.charges.forEach((charge, j) =>
        equalDecimal(charge.amount, results[1]!.simulationFills[i]!.charges[j]!.amount),
      ),
    );
  });
  it('纯后复权指标和固定金额只读取一套行情，价格研究不启动公告准备', async () => {
    const f = await priceResearchFixture();
    f.input.strategy.signalSources = [
      { ...f.input.strategy.signalSources[0]!, id: 'research', priceCoordinate: 'research' },
    ];
    f.input.strategy.entry = {
      type: 'compare',
      operator: 'gt',
      left: { type: 'series', sourceId: 'research', field: 'close' },
      right: {
        type: 'indicator',
        name: 'MA',
        input: { type: 'series', sourceId: 'research', field: 'close' },
        params: { period: 5 },
      },
    };
    f.input.strategy.sizing = { type: 'fixedAmount', amount: '400' };
    const announcements = { prepare: vi.fn() };
    const service = new BacktestRunPreparationService(
      {
        strategyVersion: {
          findUnique: vi.fn(async () => ({
            schemaVersion: 3,
            schema: f.input.strategy,
          })),
        },
      } as never,
      f.reader as never,
      f.control as never,
      announcements as never,
    );
    const prepared = await service.prepare(f.request);
    if (prepared.status !== 'prepared') throw new Error(JSON.stringify(prepared));
    expect(prepared.runConfig.priceResearch).toEqual({ protocolVersion: 'price-research-v1' });
    expect(f.reader.readV3).toHaveBeenCalledOnce();
    expect(announcements.prepare).not.toHaveBeenCalled();
  });

});

describe("研究单位、原价参考与缺口", () => {
  it('准备、冻结、离线运行保留原价参考与研究单位，且不调用权益事件', async () => {
    const f = await priceResearchFixture();
    const prepared = await prepareBacktestRunConfigV3({
      request: f.request,
      strategy: f.input.strategy,
      reader: f.reader as never,
      control: f.control,
      checkedAt: '2026-06-07T08:00:00Z',
    });
    if (prepared.status !== 'prepared') {
      for (const call of f.reader.readV3.mock.results) await call.value;
      throw new Error(JSON.stringify(prepared));
    }
    expect(prepared.runConfig.priceResearch?.actualPriceWindow).toBeDefined();
    expect(prepared.runConfig.priceInputBindings?.signals).toEqual([
      { sourceId: 'execution:actual', binding: 'actual-price-series' },
    ]);
    expect(f.reader.readV3).toHaveBeenCalledTimes(2);
    expect(f.reader.readV3.mock.calls.at(-1)?.[0]).not.toHaveProperty('requiredSource');
    const root = await mkdtemp(join(tmpdir(), 'price-research-'));
    roots.push(root);
    const snapshots = new LocalSnapshotStore(root);
    const events = vi.fn();
    const builder = new DsaSnapshotBuilder(
      { ...f.dsa, marketEventsV3: events } as never,
      snapshots,
      f.reader as never,
    );
    const output = await builder.buildV3({
      ...f.input,
      runConfig: prepared.runConfig,
      executionRouteKey: { ...f.input.executionRouteKey, adjustment: 'hfq' },
    });
    expect(output.manifest.priceResearch?.actualPriceSource?.routeKey).toMatchObject({
      adjustment: 'none',
    });
    expect(
      output.artifactRefs.some((ref) => ref.key.endsWith(priceResearchReferenceArtifactKey)),
    ).toBe(true);
    expect(events).not.toHaveBeenCalled();
    const artifacts = await Promise.all(
      output.artifactRefs.map(async (ref) => {
        const rows = [];
        for await (const row of await snapshots.artifacts.openRead(ref)) rows.push(row);
        return { key: ref.key.slice(f.input.runId.length + 1), rows };
      }),
    );
    const changed = structuredClone(artifacts);
    changed.find((artifact) => artifact.key === priceResearchReferenceArtifactKey)!.rows[0]!.close =
      '999';
    expect(() => validateCompleteSnapshotInputsV3(output.manifest, changed)).toThrow('原价参考');
    f.reader.readV3.mockRejectedValue(new Error('offline'));
    f.dsa.backtestInstrumentFacts.mockRejectedValue(new Error('offline'));
    f.dsa.backtestCalendar.mockRejectedValue(new Error('offline'));
    const result = await new LocalSnapshotV3Runner(snapshots).run(
      { runId: f.input.runId, snapshotRef: output.snapshotRef, artifactRefs: output.artifactRefs },
      new AbortController().signal,
    );
    expect(result.priceResearch).toMatchObject({
      protocolVersion: 'price-research-v1',
      fundsBalance: { currency: 'CNY' },
      simulatedPnl: { currency: 'CNY' },
    });
    expect(result.simulationFills[0]).toMatchObject({
      side: 'buy',
      quantity: '50',
      researchSizing: { referenceQuantity: '100' },
    });
    expect(result.simulationFills[0]!.researchSizing?.requestedNotional).toBeDefined();
    expect(result.metrics.totalReturn?.status).toBe('available');
    expect(result.knownCashDividendDisclosure).toBeUndefined();
  });

  it('操作时点原价缺失时不借用前一日价格确定投入', async () => {
    const f = await priceResearchFixture({ missingActualDates: ['2026-05-19'] });
    const prepared = await prepareBacktestRunConfigV3({
      request: f.request,
      strategy: f.input.strategy,
      reader: f.reader as never,
      control: f.control,
      checkedAt: '2026-06-07T08:00:00Z',
    });
    if (prepared.status !== 'prepared') throw new Error(JSON.stringify(prepared));
    const root = await mkdtemp(join(tmpdir(), 'price-research-missing-'));
    roots.push(root);
    const snapshots = new LocalSnapshotStore(root);
    const builder = new DsaSnapshotBuilder(f.dsa as never, snapshots, f.reader as never);
    const output = await builder.buildV3({
      ...f.input,
      strategyVersionHash: hashCanonicalManifest(f.input.strategy),
      runConfig: prepared.runConfig,
      executionRouteKey: { ...f.input.executionRouteKey, adjustment: 'hfq' },
    });
    const result = await new LocalSnapshotV3Runner(snapshots).run(
      { runId: f.input.runId, snapshotRef: output.snapshotRef, artifactRefs: output.artifactRefs },
      new AbortController().signal,
    );
    expect(result.simulationFills).toHaveLength(0);
    expect(result.rejectedOrders).toContainEqual(
      expect.objectContaining({
        reasonCode: 'RULE_REJECTED',
        message: expect.stringContaining('不复权参考价格'),
      }),
    );
  });
});
