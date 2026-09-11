import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backtestRunResponseSchemaV2, backtestResultSchemaV2 } from '../src/backtest-v2.js';
import { executionModelDisclosureSchema } from '../src/backtest-execution-model.js';

const model = JSON.parse(
  readFileSync(
    new URL('../fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url),
    'utf8',
  ),
);
const legacy = {
  id: 'run',
  strategyVersionId: 'version',
  mode: 'V2',
  status: 'failed',
  errorCode: 'DATA_UNAVAILABLE',
  errorSummary: 'historical trading status unavailable: 600519.SH',
};
describe('模型披露兼容契约', () => {
  it('保留旧响应和具体失败原因，不补模型', () => {
    expect(backtestRunResponseSchemaV2.parse(legacy)).toEqual(legacy);
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
      schemaVersion: '2',
      marketRuleVersion: 'rules',
      calendarVersion: 'calendar',
      aggregationVersion: 'aggregation',
      contentHash: 'snapshot-hash',
      resultChecksum: 'checksum',
      completeness: 'partial',
      warnings: ['FX unavailable'],
      rejectedOrders: [],
      simulationFills: [],
      trades: [],
      equityCurve: [],
      metrics: {},
    };
    expect(backtestResultSchemaV2.parse(result)).not.toHaveProperty('executionModelDisclosure');
    expect(
      backtestResultSchemaV2.parse({
        ...result,
        executionModelDisclosure: { model, contentHash: 'model-hash' },
      }),
    ).toMatchObject({
      completeness: 'partial',
      executionModelDisclosure: { model, contentHash: 'model-hash' },
    });
  });
});
