import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backtestRunResponseSchemaV3, backtestResultSchemaV3 } from '../src/backtest-contract.js';
import { executionModelDisclosureSchema } from '../src/backtest-execution-model.js';

const model = JSON.parse(
  readFileSync(
    new URL('../fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url),
    'utf8',
  ),
);
const snapshot = JSON.parse(
  readFileSync(new URL('../fixtures/backtest-snapshot-v3.manifest.json', import.meta.url), 'utf8'),
);
const legacy = {
  id: 'run',
  strategyVersionId: 'version',
  mode: 'V2',
  status: 'failed',
  errorCode: 'DATA_UNAVAILABLE',
  errorSummary: 'historical trading status unavailable: 600519.SH',
};
describe('模型披露契约', () => {
  it('拒绝旧响应，当前失败响应保留具体原因且不补模型', () => {
    expect(backtestRunResponseSchemaV3.safeParse(legacy).success).toBe(false);
    const current = { ...legacy, mode: 'V3' };
    expect(backtestRunResponseSchemaV3.parse(current)).toEqual(current);
  });
  it('当前响应不接纳旧结果、旧 Snapshot 或旧 RunConfig', () => {
    const current = { ...legacy, mode: 'V3' };
    expect(backtestRunResponseSchemaV3.safeParse({
      ...current, result: { schemaVersion: '2' },
    }).success).toBe(false);
    expect(backtestRunResponseSchemaV3.safeParse({
      ...current, snapshotManifest: { manifestVersion: 'snapshot-manifest-v2' },
    }).success).toBe(false);
    expect(backtestRunResponseSchemaV3.safeParse({
      ...current, runConfig: { schemaVersion: '2' },
    }).success).toBe(false);
    expect(backtestRunResponseSchemaV3.safeParse({
      ...current, snapshotManifest: snapshot,
    }).success).toBe(true);
  });
  it('选择与冻结哈希分别可用，非法模型不能伪装成有效披露', () => {
    expect(executionModelDisclosureSchema.parse({ model })).toEqual({ model });
    expect(
      executionModelDisclosureSchema.parse({ model, contentHash: 'frozen-model' }),
    ).toMatchObject({ contentHash: 'frozen-model' });
    expect(
      executionModelDisclosureSchema.safeParse({ model: { ...model, segments: [] } }).success,
    ).toBe(false);
  });
  it('部分结果保持 partial，完整模型不会升级结果完整度', () => {
    const result = {
      source: 'BACKTEST',
      runId: 'run',
      strategyVersionId: 'version',
      snapshotId: 'snapshot',
      engineVersion: 'engine',
      schemaVersion: '3',
      snapshotVersion: 'snapshot-manifest-v3',
      marketRuleVersion: 'rules',
      calendarVersion: 'calendar',
      aggregationVersion: 'aggregation',
      contentHash: '1'.repeat(64),
      resultChecksum: '2'.repeat(64),
      completeness: 'partial',
      executionPriceProtocol: snapshot.executionPriceProtocol,
      comparableDataFingerprint: snapshot.comparableDataFingerprint,
      actualSources: snapshot.actualSources,
      warnings: ['FX unavailable'],
      rejectedOrders: [],
      simulationFills: [],
      trades: [],
      equityCurve: [],
      metrics: {},
    };
    expect(backtestResultSchemaV3.parse(result)).not.toHaveProperty('executionModelDisclosure');
    expect(backtestRunResponseSchemaV3.safeParse({
      ...legacy, mode: 'V3', status: 'succeeded', result,
    }).success).toBe(true);
    expect(
      backtestResultSchemaV3.parse({
        ...result,
        executionModelDisclosure: { model, contentHash: 'model-hash' },
      }),
    ).toMatchObject({
      completeness: 'partial',
      executionModelDisclosure: { model, contentHash: 'model-hash' },
    });
  });
});
