import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tradingCalendarFromFact } from '@thesis-ledger/domain';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { validateCompleteSnapshotInputsV3 } from '../../src/backtest/backtest-snapshot-v3-completeness.js';
import { validateSnapshotCalendarAlignmentV3 } from '../../src/backtest/backtest-snapshot-v3-calendar-alignment.js';
import { planSnapshotInputsV3 } from '../../src/backtest/backtest-snapshot-v3-input-plan.js';
import { calendarFact } from '../../src/backtest/backtest-v2-execution-shared.js';
import { dailyBarSessionTimes } from '../../src/backtest/backtest-daily-bar-session.js';
import type { SnapshotDependencyV3Artifact } from '../../src/backtest/backtest-snapshot-v3-dependencies.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

const setup = async () => {
  const root = await mkdtemp(join(tmpdir(), 'v3-complete-snapshot-'));
  directories.push(root);
  const fixture = await completeSnapshotFixture();
  const snapshots = new LocalSnapshotStore(root);
  const builder = new DsaSnapshotBuilder(
    fixture.dsa as unknown as DsaClient,
    snapshots,
    fixture.reader,
  );
  return { ...fixture, snapshots, builder };
};

describe('完整 Snapshot V3', () => {
  it('冻结单份行情、所有显式用途和必要事实，断开读取器仍可回放', async () => {
    const { input, builder, snapshots, dsa, reader } = await setup();
    const result = await builder.buildV3(input);
    expect(result.manifest.quality.completeness).toBe('complete');
    expect(result.manifest.actualSources.map((source) => source.purpose)).toEqual([
      'execution',
      'signal',
      'benchmark',
    ]);
    expect(result.manifest.artifacts).toHaveLength(8);
    expect(dsa.backtestCalendar).toHaveBeenCalledOnce();
    expect(dsa.backtestInstrumentFacts).toHaveBeenCalledOnce();
    expect(reader.readV3).toHaveBeenCalledOnce();
    expect(dsa.backtestCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        start: result.manifest.warmup.startDate,
        end: '2026-06-06',
      }),
    );
    reader.readV3.mockRejectedValue(new Error('offline'));
    dsa.backtestCalendar.mockRejectedValue(new Error('offline'));
    dsa.backtestInstrumentFacts.mockRejectedValue(new Error('offline'));
    expect(await snapshots.v3.replay(input.runId)).toEqual(result.manifest);
    expect((await builder.buildV3(input)).manifest).toEqual(result.manifest);
    expect(reader.readV3).toHaveBeenCalledOnce();
  });

  it('从冻结事实重算绑定、闭包、版本及规则，而非相信 complete 标签', async () => {
    const { input, builder, snapshots } = await setup();
    const { manifest } = await builder.buildV3(input);
    const artifacts: SnapshotDependencyV3Artifact[] = [];
    for (const ref of manifest.artifacts) {
      const rows = [];
      for await (const row of await snapshots.artifacts.openRead(ref)) rows.push(row);
      artifacts.push({ key: ref.key.slice(input.runId.length + 1), rows });
    }
    expect(() => validateCompleteSnapshotInputsV3(manifest, artifacts)).not.toThrow();
    const rowsByKey = new Map(artifacts.map((artifact) => [artifact.key, artifact.rows]));
    const calendarRows = rowsByKey.get('calendar/CN.parquet');
    const executionRows = rowsByKey.get('execution/bars.parquet');
    const instrumentKey = [...rowsByKey.keys()].find((key) => key.startsWith('instrumentFacts/'));
    if (!calendarRows?.[0] || !executionRows || !instrumentKey)
      throw new Error('complete snapshot fixture lacks calendar, execution or instrument rows');
    const calendar = tradingCalendarFromFact(calendarFact(calendarRows[0]));
    const firstExecutionBar = executionRows.find(
      (row) =>
        typeof row.occurredAt === 'string' &&
        row.occurredAt.slice(0, 10) >= input.runConfig.startDate,
    );
    if (!firstExecutionBar) throw new Error('missing first execution Bar');
    const openedAt = dailyBarSessionTimes(firstExecutionBar, calendar).openedAt;
    if (!openedAt) throw new Error('missing execution open time');
    const lateFacts = new Map(rowsByKey);
    lateFacts.set(
      instrumentKey,
      rowsByKey.get(instrumentKey)!.map((row) => ({
        ...row,
        occurredAt: openedAt.replace('.000Z', '.000001Z'),
      })),
    );
    expect(() =>
      validateSnapshotCalendarAlignmentV3(
        planSnapshotInputsV3({ strategy: input.strategy, runConfig: input.runConfig }),
        lateFacts,
      ),
    ).toThrow('期初适用');
    expect(() =>
      validateCompleteSnapshotInputsV3(
        manifest,
        artifacts.filter((artifact) => !artifact.key.startsWith('calendar/')),
      ),
    ).toThrow();
    expect(() =>
      validateCompleteSnapshotInputsV3(
        manifest,
        artifacts.filter((artifact) => !artifact.key.includes('price-input-bindings')),
      ),
    ).toThrow();
    expect(() =>
      validateCompleteSnapshotInputsV3(
        { ...manifest, dependencyClosure: { ...manifest.dependencyClosure, signalSources: [] } },
        artifacts,
      ),
    ).toThrow('依赖闭包');
    expect(() =>
      validateCompleteSnapshotInputsV3(
        { ...manifest, actualSources: manifest.actualSources.slice(0, 1) },
        artifacts,
      ),
    ).toThrow('信号或基准来源');
    expect(() =>
      validateCompleteSnapshotInputsV3({ ...manifest, providerRevisions: {} }, artifacts),
    ).toThrow('事实版本');
    const forged = structuredClone(artifacts);
    const metadata = forged.find((artifact) =>
      artifact.key.endsWith('snapshot-metadata-v3.parquet'),
    )!;
    const row = metadata.rows[0]!;
    expect(row.settlementCalendarPolicy).toBe('settlement-calendar-v1');
    row.settlementCalendarPolicy = 'unknown-policy';
    expect(() => validateCompleteSnapshotInputsV3(manifest, forged)).toThrow('未知结算日历');
    delete row.settlementCalendarPolicy;
    expect(() => validateCompleteSnapshotInputsV3(manifest, forged)).toThrow();
    row.settlementCalendarPolicy = 'settlement-calendar-v1';
    const strategy = JSON.parse(String(row.strategy));
    strategy.sizing = { type: 'fixedQuantity', quantity: '100' };
    row.strategy = JSON.stringify(strategy);
    expect(() => validateCompleteSnapshotInputsV3(manifest, forged)).toThrow('规则不兼容');
  });

  it('缺失关键事实时不保留已完成快照，也不补取未声明的公司行动', async () => {
    const { input, builder, snapshots, dsa } = await setup();
    dsa.backtestInstrumentFacts.mockResolvedValue({
      version: 3,
      status: 'unavailable',
      provider: 'fixture',
      providerRevision: 'v1',
      coverage: { start: null, end: null, complete: false },
      facts: [],
      reason: 'missing facts',
    });
    await expect(builder.buildV3(input)).rejects.toMatchObject({ code: 'DATA_UNAVAILABLE' });
    expect(await snapshots.v3.load(input.runId, true)).toBeUndefined();
  });

  it('本地 complete Artifact 被删除后拒绝离线回放', async () => {
    const { input, builder, snapshots } = await setup();
    const { manifest } = await builder.buildV3(input);
    const ref = manifest.artifacts.find((artifact) => artifact.key.includes('/instrumentFacts/'))!;
    await snapshots.artifacts.delete(ref);
    await expect(snapshots.v3.replay(input.runId)).rejects.toThrow('artifact is missing');
  });

  it('行情证明与执行日历冲突时阻止 finalized，并清除本次未完成写入', async () => {
    const { input, builder, snapshots, dsa } = await setup();
    const original = dsa.backtestCalendar.getMockImplementation()!;
    dsa.backtestCalendar.mockImplementation(async (request) => {
      const response = await original(request);
      response.facts[0]!.holidays = ['2026-05-19'];
      return response;
    });
    await expect(builder.buildV3(input)).rejects.toThrow('Calendar 交易日');
    expect(await snapshots.v3.load(input.runId, true)).toBeUndefined();
  });

  it('候选范围内没有后续结算交易日时阻止 finalized', async () => {
    const { input, builder, snapshots, dsa } = await setup();
    const original = dsa.backtestCalendar.getMockImplementation()!;
    dsa.backtestCalendar.mockImplementation(async (request) => {
      const response = await original(request);
      const cursor = new Date('2026-05-21T12:00:00Z');
      const holidays: string[] = [];
      while (cursor.toISOString().slice(0, 10) <= request.end) {
        holidays.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      response.facts[0]!.holidays = holidays;
      return response;
    });
    await expect(builder.buildV3(input)).rejects.toThrow('后续结算交易日');
    expect(await snapshots.v3.load(input.runId, true)).toBeUndefined();
  });
});
