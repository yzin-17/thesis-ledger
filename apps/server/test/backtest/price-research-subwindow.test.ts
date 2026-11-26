import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  priceResearchEvidenceArtifactKey,
  priceResearchReferenceArtifactKey,
} from '@thesis-ledger/schemas';
import { deriveFrozenMarketWindowViewV3 } from '../../src/market/market-frozen-window-view-v3.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { readPriceResearchReference } from '../../src/backtest/backtest-price-research-input.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { hashCanonicalManifest, LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { validateCompleteSnapshotInputsV3 } from '../../src/backtest/backtest-snapshot-v3-completeness.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import type { MarketBarWindowReadResultV3 } from '../../src/market/market-bar-reader-v3.js';
import { priceResearchFixture } from './price-research.fixtures.js';

describe('双价格研究的冻结子窗口', () => {
  it('实验分段复用父窗口，独立校验子窗口并离线运行，拒绝错误引用与篡改', async () => {
    const f = await priceResearchFixture();
    type Selected = Extract<MarketBarWindowReadResultV3, { status: 'selected' }>;
    const stored = new Map<string, Selected>();
    const acquire = f.reader.readV3.getMockImplementation()!;
    f.reader.readV3.mockImplementation(async (input) => {
      if (!input.frozenWindowRef) {
        const read = await acquire(input);
        read.evidence.identityFingerprint = hashCanonicalManifest({
          request: read.request,
          hash: read.evidence.completeResponseHash,
        });
        stored.set(read.evidence.identityFingerprint, structuredClone(read));
        return read;
      }
      const parent = stored.get(input.frozenWindowRef.identityFingerprint)!;
      const view = deriveFrozenMarketWindowViewV3(
        {
          request: parent.request as never,
          response: parent.selection.response,
          seriesVersion: parent.seriesVersion,
          completeResponseHash: parent.evidence.completeResponseHash!,
          evidence: parent.evidence,
        },
        input.frozenWindowRef,
        input,
      );
      return {
        ...parent,
        request: view.request,
        seriesVersion: view.seriesVersion,
        frozenWindowRef: input.frozenWindowRef,
        selection: { ...parent.selection, response: view.response },
        evidence: {
          ...parent.evidence,
          identityFingerprint: hashCanonicalManifest({
            parent: input.frozenWindowRef,
            window: input.window,
          }),
          completeResponseHash: marketFrozenWindowHashV3(view.response),
          window: input.window,
          seriesVersion: view.seriesVersion,
          inputFingerprint: view.response.inputFingerprint,
          coverageProof: view.response.coverageProof,
        },
      };
    });
    const prepared = await prepareBacktestRunConfigV3({
      request: f.request,
      strategy: f.input.strategy,
      reader: f.reader as never,
      control: f.control,
      checkedAt: '2026-06-07T08:00:00Z',
    });
    if (prepared.status !== 'prepared') throw new Error(JSON.stringify(prepared));
    const runConfig = { ...prepared.runConfig, endDate: '2026-05-19' };
    const root = await mkdtemp(join(tmpdir(), 'price-research-subwindow-'));
    try {
      const snapshots = new LocalSnapshotStore(root);
      const output = await new DsaSnapshotBuilder(
        f.dsa as never,
        snapshots,
        f.reader as never,
      ).buildV3({
        ...f.input,
        runConfig,
        executionRouteKey: { ...f.input.executionRouteKey, adjustment: 'hfq' },
      });
      const artifacts = await Promise.all(
        output.artifactRefs.map(async (ref) => {
          const rows = [];
          for await (const row of await snapshots.artifacts.openRead(ref)) rows.push(row);
          return { key: ref.key.slice(f.input.runId.length + 1), rows };
        }),
      );
      const evidence = artifacts.find((a) => a.key === priceResearchEvidenceArtifactKey)!.rows[0]!;
      expect(JSON.parse(String(evidence.sourceFrozenWindowRef))).toEqual(
        runConfig.priceResearch!.actualPriceWindow,
      );
      expect(JSON.parse(String(evidence.frozenWindowRef))).not.toEqual(
        runConfig.priceResearch!.actualPriceWindow,
      );
      expect(() => validateCompleteSnapshotInputsV3(output.manifest, artifacts)).not.toThrow();
      for (const field of ['sourceFrozenWindowRef', 'frozenWindowRef', 'completeResponse']) {
        const changed = structuredClone(artifacts);
        const row = changed.find((a) => a.key === priceResearchEvidenceArtifactKey)!.rows[0]!;
        const value = JSON.parse(String(row[field]));
        if (field === 'completeResponse') value.bars[0].high += 1;
        else value.responseHash = '0'.repeat(64);
        row[field] = JSON.stringify(value);
        expect(() => validateCompleteSnapshotInputsV3(output.manifest, changed)).toThrow(
          '原价参考',
        );
      }
      const changed = structuredClone(artifacts);
      changed.find((a) => a.key === priceResearchReferenceArtifactKey)!.rows[0]!.close = '999';
      expect(() => validateCompleteSnapshotInputsV3(output.manifest, changed)).toThrow('原价参考');

      const selected = await f.reader.readV3({
        market: 'CN',
        symbol: f.input.strategy.executionInstrument.symbol,
        routeKey: { ...f.input.executionRouteKey, adjustment: 'hfq' },
        window: { start: output.manifest.dateRange.warmupStartDate, end: runConfig.endDate },
        frozenWindowRef: runConfig.frozenExecutionWindow!,
        priceResearch: true,
        dailyObservationContract: runConfig.priceResearch!.dailyObservationContract!,
      });
      const read = f.reader.readV3.getMockImplementation()!;
      f.reader.readV3.mockImplementation(async (input) => ({
        ...(await read(input)),
        frozenWindowRef: { ...input.frozenWindowRef!, responseHash: '0'.repeat(64) },
      }));
      await expect(
        readPriceResearchReference({
          strategy: f.input.strategy,
          runConfig,
          execution: selected,
          reader: f.reader,
        }),
      ).rejects.toThrow('准备时的冻结版本');
      f.reader.readV3.mockRejectedValue(new Error('offline'));
      const runner = new LocalSnapshotV3Runner(snapshots);
      const input = {
        runId: f.input.runId,
        snapshotRef: output.snapshotRef,
        artifactRefs: output.artifactRefs,
      };
      const result = await runner.run(input, new AbortController().signal);
      const replay = await runner.run(input, new AbortController().signal);
      expect(result.resultChecksum).toBe(replay.resultChecksum);
      expect(result.equityCurve.length).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
