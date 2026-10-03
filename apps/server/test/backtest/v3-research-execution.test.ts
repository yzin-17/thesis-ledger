import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { runExchangeVertical } from '../../src/backtest/backtest-v2-execution-exchange.js';
import { barResearchClocksV3 } from '../../src/backtest/backtest-v3-research-clock.js';
import {
  calendarFact,
  tradingCalendarFromFact,
} from '../../src/backtest/backtest-v2-execution-shared.js';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

const setup = async (signalOnlyAtRangeEnd = false, saleSettlementDays?: number) => {
  const root = await mkdtemp(join(tmpdir(), 'v3-research-execution-'));
  directories.push(root);
  const fixture = await completeSnapshotFixture();
  if (saleSettlementDays !== undefined) {
    for (const segment of fixture.input.runConfig.executionModel!.segments) {
      if (segment.execution.mode !== 'exchange') throw new Error('fixture requires exchange');
      segment.execution.saleReinvestableAfterTradingDays = saleSettlementDays;
    }
  }
  const original = fixture.reader.readV3.getMockImplementation()!;
  fixture.reader.readV3.mockImplementation(async (request) => {
    const result = await original(request);
    if (result.status === 'selected') {
      const response = result.selection.response;
      for (const bar of response.bars) {
        bar.availableAt = response.sourcePriceBasis.observedAt;
        if (signalOnlyAtRangeEnd) {
          bar.open = 1;
          bar.close = bar === response.bars.at(-1) ? 2 : 1;
          bar.high = bar.close;
          bar.low = 1;
        }
      }
    }
    return result;
  });
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
  const input = {
    runId: fixture.input.runId,
    strategyVersionId: fixture.input.strategyVersionId,
    snapshotId: built.snapshotRef.snapshotId,
    strategy: fixture.input.strategy,
    runConfig: fixture.input.runConfig,
    artifacts: built.artifactRefs,
    rows,
    engineVersion: 'v3-research-test',
    marketRuleVersion: built.manifest.marketRuleVersion,
    calendarVersion: built.manifest.calendarVersion,
    aggregationVersion: built.manifest.aggregationVersion,
  };
  return { input, built, snapshots };
};

describe('V3 固定快照研究执行', () => {
  it.each([0, 1, 2])('期末卖出在 T+%i 再投资模型下完成，估值范围不延伸', async (days) => {
    const { input, snapshots } = await setup(false, days);
    const result = runExchangeVertical(input);
    expect(result.rejects).toEqual([]);
    expect(result.fills.map(({ side, occurredAt }) => ({ side, occurredAt }))).toEqual([
      { side: 'buy', occurredAt: '2026-05-19T01:30:00.000Z' },
      { side: 'sell', occurredAt: '2026-05-20T01:30:00.000Z' },
    ]);
    expect(result.analytics.equityCurve).toHaveLength(3);
    expect((await snapshots.v3.replay(input.runId)).dateRange.endDate).toBe('2026-05-20');
    expect(runExchangeVertical(input)).toEqual(result);
  });

  it('用冻结历史收盘产生信号，下一交易日开盘成交，观测时间保持不可变', async () => {
    const { input, snapshots } = await setup();
    const before = structuredClone([...input.rows]);
    const result = runExchangeVertical(input);
    expect(result.rejects).toEqual([]);
    expect(result.fills.map(({ side, occurredAt }) => ({ side, occurredAt }))).toEqual([
      { side: 'buy', occurredAt: '2026-05-19T01:30:00.000Z' },
      { side: 'sell', occurredAt: '2026-05-20T01:30:00.000Z' },
    ]);
    expect(result.analytics.completeness).not.toBe('unavailable');
    expect(result.analytics.equityCurve).toHaveLength(3);
    expect([...input.rows]).toEqual(before);
    const manifest = await snapshots.v3.replay(input.runId);
    expect(manifest.quality.completeness).toBe('complete');
    expect(runExchangeVertical(input)).toEqual(result);
  });

  it('开盘和收盘使用不同决策时钟，拒绝晚于冻结截点的观测', async () => {
    const { input } = await setup();
    const calendarRows = [...input.rows.entries()].find(([key]) => key.includes('/calendar/'))![1];
    const calendar = tradingCalendarFromFact(calendarFact(calendarRows[0]!));
    const bar = [...input.rows.entries()].find(([key]) => key.includes('/execution/'))![1].at(-1)!;
    const clocks = barResearchClocksV3(bar, calendar, input.runConfig);
    expect(clocks.openResearchClock?.decisionAt).toBe('2026-05-20T01:30:00.000Z');
    expect(clocks.researchClock?.decisionAt).toBe('2026-05-20T07:00:00.000Z');
    expect(() =>
      barResearchClocksV3(
        { ...bar, availableAt: '2026-05-22T00:00:00Z' },
        calendar,
        input.runConfig,
      ),
    ).toThrow('冻结截点');
  });

  it('尾日信号保留到期未成交原因，且不会读取区间外行情成交', async () => {
    const { input } = await setup(true);
    const result = runExchangeVertical(input);
    expect(result.fills).toEqual([]);
    expect(result.rejects).toHaveLength(1);
    expect(result.rejects[0]).toMatchObject({
      code: 'DAY_EXPIRED',
      occurredAt: '2026-05-20T07:00:00.000Z',
    });
    expect(result.analytics.completeness).not.toBe('unavailable');
    expect(result.analytics.equityCurve).toHaveLength(3);
  });
});
