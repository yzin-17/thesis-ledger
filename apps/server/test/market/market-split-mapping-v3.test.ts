import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { marketEventResponseV3Schema } from '@thesis-ledger/schemas';
import { verifySplitMappingV3 } from '../../src/market/market-split-mapping-v3.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';

const fixture = () => {
  const mapping = {
    symbol: '159596.SZ',
    sourceConversionDate: '2025-10-17',
    sourceRatioPerUnit: '2',
    recordDate: '2025-10-17',
    effectiveDate: '2025-10-20',
    announcementDate: '2025-10-14',
    documentUrl: 'https://example.invalid/fixture.pdf',
    documentSha256: 'a'.repeat(64),
  };
  const content = JSON.stringify({
    contractVersion: 1,
    kind: 'split-date-mapping',
    mappings: [mapping],
  });
  const sha256 = createHash('sha256').update(content).digest('hex');
  const ref = `sha256:${sha256}`;
  const routeKey = { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'SPLIT_EVENT' };
  return marketEventResponseV3Schema.parse({
    contractVersion: 3,
    requestId: 'split-fixture',
    symbol: mapping.symbol,
    routeKey,
    routeTarget: { providerId: 'akshare', upstreamSource: 'eastmoney', routeIndex: 0 },
    desiredRevision: 1,
    effectivePolicyRevision: 1,
    catalogRevision: 1,
    start: '2025-10-20',
    end: '2025-10-20',
    dataAsOf: '2026-09-28T00:00:00Z',
    fetchedAt: '2026-09-27T01:00:00Z',
    providerRevision: 'mapped-split:fixture',
    dateMappingEvidence: { ref, sha256, content },
    admission: {
      consumer: 'thesis-ledger',
      routeKey,
      target: { providerId: 'akshare', upstreamSource: 'eastmoney' },
      status: 'admitted',
      admissionState: 'admitted',
      evidenceRef: ref,
      evidenceSha256: sha256,
      scopeSymbols: [mapping.symbol],
      scopeDateFrom: '2025-10-01',
      scopeDateTo: '2025-10-31',
      adapterRevision: 'dsa-eastmoney-fund-split-mapped-v1',
      sourceRevision: 'fixture',
      credentialRevision: 'not-required',
      validFrom: '2026-01-01T00:00:00Z',
      validUntil: '2027-01-01T00:00:00Z',
      recordedAt: '2026-01-01T00:00:00Z',
      recordVersion: 1,
      invalidatedAt: null,
      invalidationReason: null,
    },
    coverage: { complete: false, reason: 'historical_coverage_unverified' },
    facts: [
      {
        symbol: mapping.symbol,
        market: 'CN',
        instrumentType: 'ETF',
        type: 'SPLIT',
        ratio: '2.0',
        recordDate: mapping.recordDate,
        effectiveDate: mapping.effectiveDate,
        occurredAt: '2025-10-20T00:00:00+08:00',
        availableAt: '2026-09-27T00:00:00Z',
        provider: 'akshare',
        providerRevision: 'mapped-split:fixture',
      },
    ],
  });
};

describe('拆分映射原文冻结校验', () => {
  it('完整证据原文经过 Parquet 及新 Store 读取保持一致', async () => {
    const root = await mkdtemp(join(tmpdir(), 'split-evidence-'));
    try {
      const value = fixture();
      const artifact = await new LocalSnapshotStore(root).v3.putArtifact('split-evidence', {
        key: 'evidence/events.parquet',
        rows: [{ response: JSON.stringify(value) }],
      });
      const rows = [];
      for await (const row of await new LocalSnapshotStore(root).artifacts.openRead(artifact))
        rows.push(row);
      expect(rows).toHaveLength(1);
      const response = marketEventResponseV3Schema.parse(JSON.parse(String(rows[0]!.response)));
      expect(response).toEqual(value);
      expect(() => verifySplitMappingV3(response)).not.toThrow();
      expect(response.coverage.complete).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('原文经过 JSON 保存读回后仍可核验，日期和原观察时刻独立', () => {
    const value = fixture();
    const replay = marketEventResponseV3Schema.parse(JSON.parse(JSON.stringify(value)));
    expect(() => verifySplitMappingV3(replay)).not.toThrow();
    expect(replay.dateMappingEvidence?.content).toBe(value.dateMappingEvidence?.content);
    expect(replay.coverage.complete).toBe(false);
  });

  it('缺少映射原文或准入摘要不匹配时拒绝', () => {
    const value = fixture();
    expect(
      marketEventResponseV3Schema.safeParse({ ...value, dateMappingEvidence: undefined }).success,
    ).toBe(false);
    value.dateMappingEvidence!.sha256 = 'b'.repeat(64);
    expect(marketEventResponseV3Schema.safeParse(value).success).toBe(false);
  });

  it.each(['content', 'effectiveDate', 'recordDate', 'ratio'] as const)('拒绝篡改 %s', (field) => {
    const value = fixture();
    if (field === 'content') value.dateMappingEvidence!.content += ' ';
    else if (field === 'ratio') value.facts[0]!.ratio = '3';
    else value.facts[0]![field] = '2025-10-21';
    expect(() => verifySplitMappingV3(value)).toThrow();
  });
});
