import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { MarketEventRequestV3 } from '@thesis-ledger/schemas';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { validateCompleteSnapshotInputsV3 } from '../../src/backtest/backtest-snapshot-v3-completeness.js';
import type { SnapshotDependencyV3Artifact } from '../../src/backtest/backtest-snapshot-v3-dependencies.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

it('合成完整事件证据随完整快照落盘重放，映射篡改和不完整覆盖拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'split-complete-snapshot-'));
  try {
    const f = await completeSnapshotFixture();
    if (f.input.strategy.entry.type !== 'compare')
      throw new Error('fixture requires price comparison');
    f.input.strategy.entry = {
      type: 'all',
      conditions: [f.input.strategy.entry, { type: 'corporateActionEvent', eventType: 'SPLIT' }],
    };
    f.input.strategyVersionHash = hashCanonicalManifest(f.input.strategy);
    const original = f.reader.readV3.getMockImplementation()!;
    f.reader.readV3.mockImplementation(async (request) => {
      const result = await original(request);
      if (result.status !== 'selected') throw new Error('fixture unavailable');
      result.selection.effectivePolicyRevision = 7;
      result.selection.response.provenance.effectivePolicyRevision = 7;
      result.evidence.effectivePolicyRevision = 7;
      result.evidence.completeResponseHash = marketFrozenWindowHashV3(result.selection.response);
      return result;
    });
    const key = {
      kind: 'data',
      market: 'CN',
      assetType: 'ETF',
      capability: 'SPLIT_EVENT',
    } as const;
    const target = { providerId: 'akshare', upstreamSource: 'eastmoney' };
    const content = JSON.stringify({
      contractVersion: 1,
      kind: 'split-date-mapping',
      mappings: [
        {
          symbol: '159516.SZ',
          sourceConversionDate: '2026-05-18',
          sourceRatioPerUnit: '2',
          recordDate: '2026-05-18',
          effectiveDate: '2026-05-19',
          announcementDate: '2026-05-15',
          documentUrl: 'https://example.invalid/synthetic.pdf',
          documentSha256: 'a'.repeat(64),
        },
      ],
    });
    const digest = createHash('sha256').update(content).digest('hex');
    const reference = `sha256:${digest}`;
    let offline = false;
    const dsa = {
      ...f.dsa,
      effectiveControlPolicyV3: async () => ({
        projection: {
          effective: {
            contractVersion: 3,
            consumer: 'thesis-ledger',
            requestId: 'fixture-policy',
            revision: 7,
            sourceDesiredRevision: 7,
            enabled: true,
            appliedAt: '2026-05-01T00:00:00Z',
            routes: [
              {
                key,
                reason: null,
                targets: [{ ...target, routeIndex: 0, eligible: true, reason: null }],
              },
            ],
          },
        },
      }),
      marketRouteCatalogV3: async () => ({
        contractVersion: 3,
        consumer: 'thesis-ledger',
        catalogRevision: 12,
        generatedAt: '2026-05-01T00:00:00Z',
        integrity: 'complete',
        entries: [{ key, target, state: 'ready' }],
      }),
      marketEventsV3: async (request: MarketEventRequestV3) => {
        if (offline) throw new Error('offline');
        return {
          ...request,
          fetchedAt: '2026-05-20T08:00:00Z',
          providerRevision: 'synthetic-mapped-split',
          dateMappingEvidence: { ref: reference, sha256: digest, content },
          admission: {
            consumer: 'thesis-ledger',
            routeKey: key,
            target,
            status: 'admitted',
            admissionState: 'admitted',
            evidenceRef: reference,
            evidenceSha256: digest,
            scopeSymbols: [request.symbol],
            scopeDateFrom: request.start,
            scopeDateTo: request.end,
            adapterRevision: 'dsa-eastmoney-fund-split-mapped-v1',
            sourceRevision: 'synthetic',
            credentialRevision: 'not-required',
            validFrom: '2026-05-01T00:00:00Z',
            validUntil: '2026-06-01T00:00:00Z',
            recordedAt: '2026-05-01T00:00:00Z',
            recordVersion: 1,
            invalidatedAt: null,
            invalidationReason: null,
          },
          coverage: { complete: true, admissionEvidenceRef: reference },
          facts: [
            {
              symbol: request.symbol,
              market: 'CN',
              instrumentType: 'ETF',
              type: 'SPLIT',
              ratio: '2',
              effectiveDate: '2026-05-19',
              recordDate: '2026-05-18',
              occurredAt: '2026-05-19T00:00:00+08:00',
              availableAt: '2026-05-15T00:00:00Z',
              strategyVisibility: { kind: 'announcement', announcedAt: '2026-05-15T00:00:00Z' },
              provider: 'akshare',
              providerRevision: 'synthetic-mapped-split',
            },
          ],
        };
      },
    };
    const store = new LocalSnapshotStore(root);
    const built = await new DsaSnapshotBuilder(
      dsa as unknown as DsaClient,
      store,
      f.reader,
    ).buildV3(f.input);
    expect(built.manifest.quality.completeness).toBe('complete');
    offline = true;
    f.reader.readV3.mockRejectedValue(new Error('offline'));
    const fresh = new LocalSnapshotStore(root);
    expect(await fresh.v3.replay(f.input.runId)).toEqual(built.manifest);
    const run = {
      runId: f.input.runId,
      snapshotRef: built.snapshotRef,
      artifactRefs: built.artifactRefs,
    };
    const first = await new LocalSnapshotV3Runner(fresh).run(run, new AbortController().signal);
    const replay = await new LocalSnapshotV3Runner(new LocalSnapshotStore(root)).run(
      run,
      new AbortController().signal,
    );
    expect(replay).toEqual(first);
    const artifacts: SnapshotDependencyV3Artifact[] = [];
    for (const ref of built.manifest.artifacts) {
      const rows = [];
      for await (const row of await fresh.artifacts.openRead(ref)) rows.push(row);
      artifacts.push({ key: ref.key.slice(f.input.runId.length + 1), rows });
    }
    const proof = artifacts.find((item) => item.key.endsWith('dependency-evidence-v3.parquet'))!;
    const row = proof.rows.find((item) => item.purpose === 'corporateActions')!;
    const bundle = JSON.parse(String(row.response));
    expect(bundle.exchanges[0].response.dateMappingEvidence.content).toBe(content);
    bundle.exchanges[0].response.dateMappingEvidence.content += ' ';
    row.response = JSON.stringify(bundle);
    expect(() => validateCompleteSnapshotInputsV3(built.manifest, artifacts)).toThrow();
    bundle.exchanges[0].response.dateMappingEvidence.content = content;
    bundle.exchanges[0].response.coverage = {
      complete: false,
      reason: 'historical_coverage_unverified',
    };
    row.response = JSON.stringify(bundle);
    expect(() => validateCompleteSnapshotInputsV3(built.manifest, artifacts)).toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
