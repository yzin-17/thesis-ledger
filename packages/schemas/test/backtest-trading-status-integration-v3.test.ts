import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backtestSnapshotManifestV3Schema } from '../src/backtest-data.js';
import { backtestResultSchemaV3 } from '../src/backtest-result.js';
import { tradingStatusFreezeVersionV3 } from '../src/backtest-trading-status-v3.js';

const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL('../fixtures/backtest-snapshot-v3.manifest.json', import.meta.url),
      'utf8',
    ),
  );
describe('停复牌冻结与结果可选接缝', () => {
  it('旧快照不增加状态或基准版本，新引用只接受已知冻结版本', () => {
    const old = fixture();
    delete old.benchmarkCostVersion;
    expect(backtestSnapshotManifestV3Schema.parse(old)).toEqual(old);
    const ref = {
      artifactKey: `${old.runId}/metadata/trading-status-v3.parquet`,
      freezeVersion: tradingStatusFreezeVersionV3,
    };
    expect(
      backtestSnapshotManifestV3Schema.parse({ ...old, tradingStatus: ref }).tradingStatus,
    ).toEqual(ref);
    expect(
      backtestSnapshotManifestV3Schema.safeParse({
        ...old,
        tradingStatus: { ...ref, freezeVersion: 'future' },
      }).success,
    ).toBe(false);
  });
  it('旧结果没有披露时保持原字段集合，未纳入状态必须携带原因', () => {
    const manifest = fixture();
    const old = {
      source: 'BACKTEST',
      runId: manifest.runId,
      strategyVersionId: manifest.strategyVersionId,
      snapshotId: manifest.contentHash,
      contentHash: manifest.contentHash,
      resultChecksum: 'old-result',
      engineVersion: 'test-runner',
      schemaVersion: '3',
      snapshotVersion: 'snapshot-manifest-v3',
      marketRuleVersion: manifest.marketRuleVersion,
      calendarVersion: manifest.calendarVersion,
      aggregationVersion: manifest.aggregationVersion,
      completeness: 'complete',
      warnings: [],
      rejectedOrders: [],
      simulationFills: [],
      trades: [],
      equityCurve: [],
      metrics: {},
      executionPriceProtocol: manifest.executionPriceProtocol,
      comparableDataFingerprint: manifest.comparableDataFingerprint,
      actualSources: manifest.actualSources,
    };
    expect(backtestResultSchemaV3.parse(old)).toEqual(old);
    const disclosure = { status: 'notIncluded', reason: '未配置状态来源，沿用已选研究假设。' };
    expect(
      backtestResultSchemaV3.parse({ ...old, tradingStatusDisclosure: disclosure })
        .tradingStatusDisclosure,
    ).toEqual(disclosure);
    expect(
      backtestResultSchemaV3.safeParse({
        ...old,
        tradingStatusDisclosure: { status: 'notIncluded' },
      }).success,
    ).toBe(false);
  });
});
