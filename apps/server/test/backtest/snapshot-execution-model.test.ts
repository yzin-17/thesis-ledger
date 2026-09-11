import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runConfigSchemaV2, type StrategySchemaV2 } from '@thesis-ledger/schemas';
import {
  buildSnapshotManifest,
  canonicalizeManifest,
  LocalSnapshotStore,
} from '../../src/backtest/backtest-snapshot.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const fixture = async (name: string) =>
  JSON.parse(
    await readFile(
      new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url),
      'utf8',
    ),
  );
const input = async () => ({
  runId: 'model-integrity',
  strategyVersionId: 'sv-1',
  strategyVersionHash: 'strategy-1',
  strategy: (await fixture('backtest-v2.exchange.json')) as StrategySchemaV2,
  runConfig: runConfigSchemaV2.parse({
    startDate: '2024-01-02',
    endDate: '2024-03-29',
    dataAsOf: '2024-03-29T16:00:00Z',
    baseCurrency: 'CNY',
    initialCash: { CNY: '1000000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    executionModel: await fixture('backtest-execution-model.cn-2024q1.json'),
  }),
});

describe('模型 Snapshot 完整性与兼容边界', () => {
  it.each(['missing', 'modelChanged', 'configChanged'] as const)(
    '拒绝无对应内容的冻结模型: %s',
    async (variation) => {
      const root = await mkdtemp(join(tmpdir(), 'model-integrity-'));
      roots.push(root);
      const store = new LocalSnapshotStore(root);
      const value = await input();
      const manifest = await store.startBuild(value);
      const config = structuredClone(value.runConfig);
      if (variation === 'configChanged')
        config.executionModel!.segments[0]!.source.description += '变化';
      const artifacts = [
        await store.putArtifact(value.runId, {
          key: 'metadata/snapshot-metadata.parquet',
          rows: [{ kind: 'snapshot-metadata', runConfig: canonicalizeManifest(config) }],
        }),
      ];
      if (variation !== 'missing') {
        const model = structuredClone(value.runConfig.executionModel!);
        if (variation === 'modelChanged') model.segments[0]!.source.description += '变化';
        artifacts.push(
          await store.putArtifact(value.runId, {
            key: 'metadata/execution-model.parquet',
            rows: [{ kind: 'execution-model', model: canonicalizeManifest(model) }],
          }),
        );
      }
      await expect(store.finalize(value.runId, manifest, artifacts)).rejects.toThrow(/模型/);
      expect((await store.load(value.runId))?.status).toBe('building');
    },
  );

  it('拒绝新模型降级为旧 Manifest 和未来配置时间', async () => {
    const value = await input();
    expect(() =>
      buildSnapshotManifest({ ...value, versions: { manifestVersion: 'snapshot-manifest-v1' } }),
    ).toThrow('snapshot-manifest-v2');
    const source = value.runConfig.executionModel!.segments[0]!.source;
    if (source.kind === 'historicalFact') throw new Error('测试必须使用研究配置');
    source.configuredAt = '2999-01-01T00:00:00Z';
    expect(() => buildSnapshotManifest(value)).toThrow('configuredAt');
  });
});
