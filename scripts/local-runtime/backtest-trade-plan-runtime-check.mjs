// 在目标 Server／Worker 内执行冻结模拟，临时目录始终清理，不连接业务数据库。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { aiGenerationContracts, strategySchema } from '@thesis-ledger/schemas';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import { LocalSnapshotStore } from '../../apps/server/dist/src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../apps/server/dist/src/backtest/backtest-v3-runner.js';

export async function checkTradePlanRuntime(input) {
  const require = createRequire(resolve(process.cwd(), 'package.json'));
  const locations = {
    domain: dirname(require.resolve('@thesis-ledger/domain')),
    schemas: dirname(require.resolve('@thesis-ledger/schemas')),
    server: resolve('apps/server/dist/src'),
  };
  for (const file of input.hashes) {
    assert(['domain', 'schemas', 'server'].includes(file.area));
    assert(!file.path.split('/').includes('..'));
    const bytes = await readFile(resolve(locations[file.area], file.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
  assert.deepEqual(
    [
      aiGenerationContracts.strategyDiscovery.ref.version,
      aiGenerationContracts.authoringGeneration.ref.version,
      aiGenerationContracts.authoringModification.ref.version,
    ],
    ['strategy-discovery-v5', 'authoring-generation-v5', 'authoring-modification-v5'],
  );
  const results = [];
  for (const sample of input.samples) {
    const configuration = strategySchema.parse(sample.configuration);
    assert.deepEqual(backtestStrategyPlanReadback(configuration), sample.readback);
    const root = await mkdtemp(resolve(tmpdir(), 'ledger-plan-acceptance-'));
    try {
      for (const file of sample.files) {
        assert(!file.path.split(/[\\/]/).includes('..'));
        const target = resolve(root, file.path);
        assert(target.startsWith(root + '/'));
        await mkdir(dirname(target), { recursive: true, mode: 0o700 });
        await writeFile(target, Buffer.from(file.base64, 'base64'), { mode: 0o600, flag: 'wx' });
      }
      const snapshots = new LocalSnapshotStore(root),
        manifest = await snapshots.v3.replay(sample.runId);
      // Runner 本身核对配置哈希、全部 Artifact、冻结输入和结果合同。
      const runner = new LocalSnapshotV3Runner(snapshots),
        request = {
          runId: manifest.runId,
          snapshotRef: { snapshotId: manifest.contentHash, contentHash: manifest.contentHash },
          artifactRefs: manifest.artifacts,
        };
      // 全交易日分钟输入比日线包含更多事件，保持同一完整 Runner 与回放核对。
      const result = await runner.run(request, AbortSignal.timeout(120000));
      assert.deepEqual(await runner.run(request, AbortSignal.timeout(120000)), result);
      assert.deepEqual(result, sample.result);
      results.push({
        id: sample.id,
        capture: sample.capture,
        checksum: result.resultChecksum,
        fills: result.simulationFills,
        readback: sample.readback,
        capturedReadback: sample.capturedReadback,
        capturedReadbackEqual: isDeepStrictEqual(sample.readback, sample.capturedReadback),
        replayEqual: true,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
  return { status: 'passed', databaseWrites: 0, modelCalls: 0, results };
}
