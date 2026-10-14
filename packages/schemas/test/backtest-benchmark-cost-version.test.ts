import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  backtestSnapshotManifestV3Schema,
  benchmarkExecutionModelCostVersionV3,
} from '../src/backtest-snapshot-manifest-v3.js';

const legacy = JSON.parse(
  readFileSync(new URL('../fixtures/backtest-snapshot-v3.manifest.json', import.meta.url), 'utf8'),
);

describe('基准成本计算版本冻结合同', () => {
  it('旧快照不补造新版本，保留原字段集合', () => {
    const parsed = backtestSnapshotManifestV3Schema.parse(legacy);
    expect(parsed).toEqual(legacy);
    expect(parsed).not.toHaveProperty('benchmarkCostVersion');
  });
  it('接受新快照显式冻结的执行模型成本版本', () => {
    const current = { ...legacy, benchmarkCostVersion: benchmarkExecutionModelCostVersionV3 };
    expect(backtestSnapshotManifestV3Schema.parse(current)).toEqual(current);
  });
  it.each(['', 'execution-model-cost-v2', null])('拒绝未知或无效版本：%j', (version) => {
    expect(
      backtestSnapshotManifestV3Schema.safeParse({ ...legacy, benchmarkCostVersion: version })
        .success,
    ).toBe(false);
  });
});
