import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backtestUnknownListingWarningV3 } from '@thesis-ledger/schemas';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import {
  validateSnapshotTradabilityV3,
  tradabilityWindowFromResponseV3,
} from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(unknown = true, missing: string[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'v3-unknown-listing-'));
  roots.push(root);
  const value = await completeSnapshotFixture();
  value.input.strategyVersionHash = hashCanonicalManifest(value.input.strategy);
  value.reader.readV3.mockImplementation((request) =>
    makeReaderResult(request, false, missing, unknown),
  );
  const store = new LocalSnapshotStore(root);
  const builder = new DsaSnapshotBuilder(value.dsa as unknown as DsaClient, store, value.reader);
  return { ...value, store, builder, runner: new LocalSnapshotV3Runner(store) };
}

describe('未知上市信息的冻结消费者', () => {
  it('未知信息原样冻结，真实 Runner 与已知信息的计算相同，断网后重复核验一致', async () => {
    const f = await setup();
    const built = await f.builder.buildV3(f.input);
    expect(built.manifest.quality.completeness).toBe('complete');
    const evidenceRef = built.manifest.artifacts.find((ref) =>
      ref.key.endsWith('metadata/market-window-evidence-v3.parquet'),
    )!;
    const rows = [];
    for await (const row of await f.store.artifacts.openRead(evidenceRef)) rows.push(row);
    const evidence = rows[0]!;
    expect(JSON.parse(String(evidence.coverageProof)).listing).toEqual({
      symbol: f.input.strategy.executionInstrument.symbol,
      status: 'unknown',
    });
    expect(JSON.parse(String(evidence.historicalTradabilityWindows))[0].listing).toEqual({
      status: 'unknown',
    });
    const request = {
      runId: f.input.runId,
      snapshotRef: {
        snapshotId: built.manifest.contentHash!,
        contentHash: built.manifest.contentHash!,
      },
      artifactRefs: built.manifest.artifacts,
    };
    const result = await f.runner.run(request, new AbortController().signal);
    const known = await setup(false);
    const knownBuilt = await known.builder.buildV3(known.input);
    const knownResult = await known.runner.run(
      {
        runId: known.input.runId,
        snapshotRef: {
          snapshotId: knownBuilt.manifest.contentHash!,
          contentHash: knownBuilt.manifest.contentHash!,
        },
        artifactRefs: knownBuilt.manifest.artifacts,
      },
      new AbortController().signal,
    );
    expect(result.simulationFills).toEqual(knownResult.simulationFills);
    expect(knownResult.resultChecksum).toBe('7aa84c45e97d07ff');
    expect(result.warnings).toContain(backtestUnknownListingWarningV3);
    expect(knownResult.warnings).not.toContain(backtestUnknownListingWarningV3);
    expect(result.completeness).toEqual(knownResult.completeness);
    expect(result.metrics).toEqual(knownResult.metrics);
    expect(result.benchmark).toEqual(knownResult.benchmark);
    expect(result.equityCurve).toEqual(knownResult.equityCurve);
    f.reader.readV3.mockRejectedValue(new Error('offline'));
    f.dsa.backtestCalendar.mockRejectedValue(new Error('offline'));
    f.dsa.backtestInstrumentFacts.mockRejectedValue(new Error('offline'));
    expect(await f.store.v3.replay(f.input.runId)).toEqual(built.manifest);
    expect((await f.builder.buildV3(f.input)).manifest).toEqual(built.manifest);
    expect(await f.runner.run(request, new AbortController().signal)).toEqual(result);
    expect(await f.runner.run(request, new AbortController().signal)).toEqual(result);
    expect(f.reader.readV3).toHaveBeenCalledOnce();
    expect(f.dsa.backtestCalendar).toHaveBeenCalledOnce();
    expect(f.dsa.backtestInstrumentFacts).toHaveBeenCalledOnce();
  }, 30_000);

  it('未知信息也不能把全部无行情的执行区间当作有效回测', async () => {
    const f = await setup(true, ['2026-05-18', '2026-05-19', '2026-05-20']);
    await expect(f.builder.buildV3(f.input)).rejects.toThrow(/没有交易日/);
  });

  it.each(['future-bar', 'future-calendar', 'pit', 'known-mismatch'])(
    '未知上市信息仍拒绝 %s',
    async (mode) => {
      const f = await setup();
      const range = { start: '2026-05-18', end: '2026-05-20' };
      const selected = await makeReaderResult(
        {
          symbol: f.input.strategy.executionInstrument.symbol,
          market: 'CN',
          routeKey: {
            kind: 'bar',
            market: 'CN',
            assetType: 'ETF',
            capability: 'DAILY_BAR',
            timeframe: '1d',
            adjustment: 'qfq',
          },
          window: range,
          tradabilityMode: 'assume-untradable-no-bar',
        },
        false,
        [],
        true,
      );
      if (selected.status !== 'selected') throw new Error('受控输入不可用');
      const window = tradabilityWindowFromResponseV3(selected.selection.response);
      const response = await f.dsa.backtestInstrumentFacts({
        symbol: window.symbol,
        market: 'CN',
        instrumentType: 'ETF',
        ...range,
        executionStart: range.start,
        executionEnd: range.end,
        dataAsOf: f.input.runConfig.dataAsOf,
      });
      response.historicalTradability = structuredClone(window.historicalTradabilityWindows![0]!);
      const day = response.historicalTradability;
      if (mode === 'future-bar') day.barSource.observedAt = '2027-01-01T00:00:00Z';
      if (mode === 'future-calendar') day.calendar.source.availableAt = '2027-01-01T00:00:00Z';
      if (mode === 'pit')
        f.input.runConfig.executionPriceProtocol.history = {
          basis: 'point-in-time',
          reconstructionEvidenceRef: 'price-only',
        };
      if (mode === 'known-mismatch')
        day.listing = {
          listedOn: '2023-07-27',
          source: { provider: 'fixture', revision: 'r1', availableAt: '2023-07-24T00:00:00Z' },
        };
      delete window.historicalTradabilityWindows;
      expect(() =>
        validateSnapshotTradabilityV3(window, f.input.runConfig, range, response),
      ).toThrow();
    },
  );
});
