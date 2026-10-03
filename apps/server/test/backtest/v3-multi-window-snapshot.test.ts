import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { canonicalMarketMultiWindowEncodingV3, sliceTradabilityWindowsV3, type MarketDataMultiWindowResponseV3 } from '@thesis-ledger/schemas';
import { buildInput, makeReaderResult } from './v3-snapshot-fixtures.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { canonicalizeManifest, LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { validateSnapshotMultiWindowV3 } from '../../src/backtest/backtest-snapshot-v3-multi-window.js';
import { validateExecutionBarsEvidenceV3 } from '../../src/backtest/backtest-snapshot-v3-execution-bars.js';
import { parseExecutionWindowEvidenceV3, validateExecutionWindowCoverageV3 } from '../../src/backtest/backtest-snapshot-v3-execution-window.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import type { MarketBarWindowReadInputV3 } from '../../src/market/market-bar-reader-v3.js';

it('多窗口证据经过 Parquet 写入和离线重放，删除或改写证据与执行价格时拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'multi-window-snapshot-'));
  try {
    const { input } = await buildInput();
    const baseline = await makeReaderResult({ market: 'CN', symbol: '159516.SZ',
      routeKey: { kind: 'bar', market: 'CN', assetType: 'ETF', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'qfq' },
      window: { start: '2026-04-24', end: '2026-05-20' }, tradabilityMode: 'assume-untradable-no-bar' });
    if (baseline.status !== 'selected') throw new Error('缺少预热夹具');
    const base = baseline.selection.response;
    const middle = Math.floor(base.bars.length / 2);
    const observations = [[0, middle + 1], [middle, base.bars.length]].map(([start, end]) => {
      const child = structuredClone(base);
      child.bars = child.bars.slice(start, end);
      const dates = child.coverageProof.calendar.expectedSessionDates.slice(start, end);
      child.coverageProof.calendar.expectedSessionDates = dates;
      child.coverageProof.window.requestedStart = dates[0]!;
      child.coverageProof.window.requestedEnd = dates.at(-1)!;
      child.coverage.requestedStart = dates[0]!;
      child.coverage.requestedEnd = dates.at(-1)!;
      child.coverage.actualStart = child.bars[0]!.timestamp;
      child.coverage.actualEnd = child.bars.at(-1)!.timestamp;
      child.coverage.latestCompleteTradingDate = dates.at(-1)!;
      child.historicalTradabilityWindows = sliceTradabilityWindowsV3(base.historicalTradabilityWindows!, { start: dates[0]!, end: dates.at(-1)! });
      return { startedAt: '2026-05-20T07:00:00Z', completedAt: '2026-05-20T07:02:00Z', response: child };
    });
    const response: MarketDataMultiWindowResponseV3 = { ...base, windowObservations: observations,
      historicalTradabilityWindows: observations.flatMap((item) => item.response.historicalTradabilityWindows!),
      sourcePriceBasis: { ...base.sourcePriceBasis, basisScope: 'request-window',
        observedAt: '2026-05-20T07:02:00Z',
        revision: { origin: 'local-observation', contentHash: '0'.repeat(64) } } };
    const hash = createHash('sha256').update(canonicalMarketMultiWindowEncodingV3(response)).digest('hex');
    response.inputFingerprint = hash;
    response.sourcePriceBasis.revision = { origin: 'local-observation', contentHash: hash };
    input.runConfig.executionPriceProtocol.priceBasis = { ...response.sourcePriceBasis, quantityBasis: 'normalized-units' };
    const readV3 = async (request: MarketBarWindowReadInputV3) => {
      const selected = await makeReaderResult(request);
      if (selected.status !== 'selected') throw new Error('夹具必须提供完整窗口');
      expect(request.window).toEqual({ start: response.coverage.requestedStart, end: response.coverage.requestedEnd });
      response.requestId = selected.request.requestId;
      selected.selection.response = response;
      Object.assign(selected.evidence, { inputFingerprint: response.inputFingerprint,
        sourcePriceBasis: response.sourcePriceBasis, coverageProof: response.coverageProof,
        completeResponseHash: marketFrozenWindowHashV3(response) });
      return selected;
    };
    const snapshots = new LocalSnapshotStore(root);
    const builder = new DsaSnapshotBuilder({} as never, snapshots, { readV3 } as never);
    const result = await builder.buildV3(input);
    expect(result.manifest.actualSources[0]?.windowProtocol).toBe('market-multi-window-content-v1');
    expect(await snapshots.v3.replay(input.runId)).toEqual(result.manifest);
    const rows = async (suffix: string) => {
      const ref = result.artifactRefs.find((item) => item.key.endsWith(suffix))!;
      const values: ArtifactRow[] = [];
      for await (const row of await snapshots.artifacts.openRead(ref)) values.push(row);
      return values;
    };
    const evidence = (await rows('/market-window-evidence-v3.parquet'))[0]!;
    const bars = await rows('/execution/bars.parquet');
    const context = { source: result.manifest.actualSources[0]!, request: JSON.parse(String(evidence.request)),
      evidence, bars, dataAsOf: result.manifest.dataAsOf, canonicalize: canonicalizeManifest };
    expect(() => validateSnapshotMultiWindowV3(context)).not.toThrow();
    const missing = { ...evidence };
    delete missing.multiWindowResponse;
    expect(() => validateSnapshotMultiWindowV3({ ...context, evidence: missing })).toThrow();
    const changed = JSON.parse(String(evidence.multiWindowResponse));
    changed.windowObservations[0].completedAt = '2026-05-20T07:03:00Z';
    expect(() => validateSnapshotMultiWindowV3({ ...context,
      evidence: { ...evidence, multiWindowResponse: JSON.stringify(changed) } })).toThrow();
    const lateObservation = JSON.parse(String(evidence.multiWindowResponse));
    lateObservation.windowObservations[0].completedAt = '2026-05-20T07:02:00.000001Z';
    expect(() => validateSnapshotMultiWindowV3({ ...context,
      dataAsOf: '2026-05-20T07:02:00.000Z',
      evidence: { ...evidence, multiWindowResponse: JSON.stringify(lateObservation) },
    })).toThrow();
    const evidenceContext = {
      readRows: async () => [] as ArtifactRow[],
      canonicalize: canonicalizeManifest,
      hash: (value: unknown) => createHash('sha256').update(canonicalizeManifest(value)).digest('hex'),
      integrityError: (message: string) => new Error(message),
    };
    const executionSource = result.manifest.actualSources[0]!;
    const executionRoute = executionSource.routeKey;
    if (executionRoute.kind !== 'bar') throw new Error('execution route is not a Bar');
    const latestAvailableAt = bars.at(-1)?.availableAt;
    if (typeof latestAvailableAt !== 'string') throw new Error('latest Bar has no availability');
    const lateBarManifest = { ...result.manifest, dataAsOf: latestAvailableAt };
    const lateBarRows = bars.map((row, index) => index === bars.length - 1
      ? { ...row, availableAt: latestAvailableAt.replace('.000Z', '.000001Z') }
      : row);
    const lateBarEvidence = { ...evidence, barRowsFingerprint: evidenceContext.hash(lateBarRows) };
    expect(() => validateExecutionBarsEvidenceV3(
      lateBarManifest, executionSource, executionRoute, lateBarEvidence,
      lateBarRows, base.coverageProof, evidenceContext,
    )).toThrow();
    const lateTimestampRows = bars.map((row, index) => index === bars.length - 1
      ? { ...row, occurredAt: latestAvailableAt.replace('.000Z', '.000001Z') }
      : row);
    expect(() => validateExecutionBarsEvidenceV3(
      lateBarManifest, executionSource, executionRoute,
      { ...evidence, barRowsFingerprint: evidenceContext.hash(lateTimestampRows) },
      lateTimestampRows, base.coverageProof, evidenceContext,
    )).toThrow();
    const lateBasis = { ...response.sourcePriceBasis, observedAt: '2026-05-20T07:02:00.000001Z' };
    const lateBasisManifest = { ...result.manifest,
      dataAsOf: '2026-05-20T07:02:00.000Z',
      executionPriceProtocol: { ...result.manifest.executionPriceProtocol,
        priceBasis: { ...result.manifest.executionPriceProtocol.priceBasis,
          observedAt: lateBasis.observedAt } } };
    const parsedEvidence = parseExecutionWindowEvidenceV3(
      result.manifest, input.runConfig, executionSource, [evidence], bars, evidenceContext,
    );
    expect(() => validateExecutionWindowCoverageV3(
      lateBasisManifest, executionSource, executionRoute,
      { ...parsedEvidence, sourcePriceBasis: lateBasis },
      evidenceContext,
    )).toThrow();
    expect(() => validateSnapshotMultiWindowV3({ ...context,
      bars: [{ ...bars[0], close: '999' }, ...bars.slice(1)] })).toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
