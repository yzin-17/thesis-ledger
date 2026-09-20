import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { strategySchemaV2, runConfigSchemaV2, type StrategySchemaV2 } from '@thesis-ledger/schemas';
import { afterEach, describe, expect, it } from 'vitest';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { BacktestV2RunService } from '../../src/backtest/backtest-v2-run.js';
import { testResultReadPolicy } from './test-result-read-policy.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';

const roots: string[] = [];

const strategy = strategySchemaV2.parse({
  schemaVersion: '2',
  name: 'comparable fingerprint',
  signalSources: [
    {
      id: 'close',
      asset: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
      timeframe: '1d',
      series: ['close'],
    },
  ],
  executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
  primaryTimeframe: '1d',
  entry: {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'close', field: 'close' },
    right: { type: 'constant', value: '1' },
  },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'fixedQuantity', quantity: '1' },
  risk: [],
  execution: { mode: 'exchange', orderType: 'market', timeInForce: 'DAY', timing: 'nextEligibleBarOpen' },
  cost: { commissionRate: '0', slippageRate: '0' },
}) as StrategySchemaV2;

const runConfig = runConfigSchemaV2.parse({
  startDate: '2024-01-02',
  endDate: '2024-01-03',
  dataAsOf: '2024-01-04T00:00:00Z',
  baseCurrency: 'CNY',
  initialCash: { CNY: '10000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '15:00',
    pricePolicy: 'latestAvailable',
    fxPolicy: 'latestAvailable',
  },
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const buildSnapshot = async (
  store: LocalSnapshotStore,
  runId: string,
  rows: readonly ArtifactRow[],
  calendar: ArtifactRow,
) => {
  const manifest = await store.startBuild({
    runId,
    strategyVersionId: 'strategy-version',
    strategyVersionHash: 'strategy-hash',
    strategy,
    runConfig,
  });
  const metadata = await store.putArtifact(runId, {
    key: 'metadata/snapshot-metadata.parquet',
    rows: [{ kind: 'snapshot-metadata', runSpecific: runId }],
  });
  const bars = await store.putArtifact(runId, { key: 'signal/CN-600519-1d.parquet', rows });
  const calendarArtifact = await store.putArtifact(runId, {
    key: 'calendar/CN.parquet',
    rows: [calendar],
  });
  await store.finalize(runId, manifest, [metadata, bars, calendarArtifact]);
};

const barsFor = (runId: string, closeOnSecondDay = '10'): ArtifactRow[] => [
  {
    date: '2024-01-01',
    close: runId === 'run-a' ? '1' : '999',
    provider: 'provider',
    providerRevision: 'rev-1',
    inputFingerprint: `request-${runId}`,
  },
  {
    date: '2024-01-02',
    close: closeOnSecondDay,
    provider: 'provider',
    upstreamSource: 'source',
    providerRevision: 'rev-1',
    inputFingerprint: `request-${runId}`,
  },
  {
    tradingDate: '2024-01-03',
    close: '11',
    provider: 'provider',
    upstreamSource: 'source',
    providerRevision: 'rev-1',
    inputFingerprint: `request-${runId}`,
  },
  { effectiveDate: '2024-01-04', close: '12', provider: 'provider', providerRevision: 'rev-1' },
];

const calendarFor = (runId: string): ArtifactRow => ({
  availableAt: runId === 'run-a' ? '2023-11-30T16:00:00Z' : '2023-12-14T16:00:00Z',
  market: 'CN',
  provider: 'calendar-provider',
  providerRevision: 'calendar-rev-1',
  range: JSON.stringify({ start: runId === 'run-a' ? '2023-12-01' : '2023-12-15', end: '2024-01-03' }),
  holidays: JSON.stringify(runId === 'run-a' ? ['2023-12-25'] : ['2023-12-20', '2023-12-25']),
  sessionOverrides: JSON.stringify([
    { date: '2023-12-20', sessions: [] },
    { date: '2024-01-02', sessions: [{ startMinute: 570, endMinute: 690 }] },
  ]),
});

describe('Backtest comparable data fingerprint', () => {
  it('ignores run identity, warmup rows, request input fingerprints and metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thesis-ledger-comparable-fingerprint-'));
    roots.push(root);
    const store = new LocalSnapshotStore(root);
    await buildSnapshot(store, 'run-a', barsFor('run-a'), calendarFor('run-a'));
    await buildSnapshot(store, 'run-b', barsFor('run-b').reverse(), calendarFor('run-b'));
    const runs = new BacktestV2RunService({} as never, undefined, store);

    const first = await runs.comparableDataFingerprint('run-a', { start: '2024-01-02', end: '2024-01-03' });
    const second = await runs.comparableDataFingerprint('run-b', { start: '2024-01-02', end: '2024-01-03' });
    expect(second).toBe(first);
    await expect(
      new BacktestService({} as never, undefined, runs, testResultReadPolicy()).comparableDataFingerprint(
        'run-b',
        {
        start: '2024-01-02',
        end: '2024-01-03',
        },
      ),
    ).resolves.toBe(first);
  });

  it('保留执行范围内的真实价格及 provider revision 差异', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thesis-ledger-comparable-fingerprint-'));
    roots.push(root);
    const store = new LocalSnapshotStore(root);
    await buildSnapshot(store, 'run-a', barsFor('run-a'), calendarFor('run-a'));
    await buildSnapshot(store, 'run-price-change', barsFor('run-price-change', '10.1'), calendarFor('run-a'));
    const changedRevision = { ...calendarFor('run-a'), providerRevision: 'calendar-rev-2' };
    await buildSnapshot(store, 'run-revision-change', barsFor('run-revision-change'), changedRevision);
    const runs = new BacktestV2RunService({} as never, undefined, store);
    const baseline = await runs.comparableDataFingerprint('run-a', { start: '2024-01-02', end: '2024-01-03' });

    await expect(
      runs.comparableDataFingerprint('run-price-change', { start: '2024-01-02', end: '2024-01-03' }),
    ).resolves.not.toBe(baseline);
    await expect(
      runs.comparableDataFingerprint('run-revision-change', { start: '2024-01-02', end: '2024-01-03' }),
    ).resolves.not.toBe(baseline);
  });

  it('将表示同一时刻的 ISO 时间格式归一化，但保留真实时间差异', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thesis-ledger-comparable-fingerprint-'));
    roots.push(root);
    const store = new LocalSnapshotStore(root);
    const row = {
      occurredAt: '2024-01-02T00:00:00+00:00',
      availableAt: '2024-01-02T07:00:00+00:00',
      amount: '102238562.39999999',
      close: '10',
      provider: 'provider',
      providerRevision: 'rev-1',
    } satisfies ArtifactRow;
    await buildSnapshot(store, 'run-a', [row], calendarFor('run-a'));
    await buildSnapshot(
      store,
      'run-equivalent-time',
      [{
        ...row,
        occurredAt: '2024-01-02T00:00:00.000Z',
        availableAt: '2024-01-02T07:00:00.000Z',
        amount: '102238562.4',
      }],
      calendarFor('run-a'),
    );
    await buildSnapshot(
      store,
      'run-changed-time',
      [{ ...row, availableAt: '2024-01-02T07:00:01.000Z' }],
      calendarFor('run-a'),
    );
    await buildSnapshot(
      store,
      'run-changed-amount',
      [{ ...row, amount: '102238563.4' }],
      calendarFor('run-a'),
    );
    const runs = new BacktestV2RunService({} as never, undefined, store);
    const baseline = await runs.comparableDataFingerprint('run-a', {
      start: '2024-01-02',
      end: '2024-01-03',
    });

    await expect(
      runs.comparableDataFingerprint('run-equivalent-time', {
        start: '2024-01-02',
        end: '2024-01-03',
      }),
    ).resolves.toBe(baseline);
    await expect(
      runs.comparableDataFingerprint('run-changed-time', {
        start: '2024-01-02',
        end: '2024-01-03',
      }),
    ).resolves.not.toBe(baseline);
    await expect(
      runs.comparableDataFingerprint('run-changed-amount', {
        start: '2024-01-02',
        end: '2024-01-03',
      }),
    ).resolves.not.toBe(baseline);
  });
});
