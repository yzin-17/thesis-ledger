import { ConflictException } from '@nestjs/common';
import type { BacktestJob } from '@prisma/client';
import { backtestRunCreateSchemaV3, strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import type { BacktestCreationGuardService } from './backtest-creation-guard.service.js';
import { readBacktestMaterialization } from './backtest-job-materialization-input.js';
import { advanceBacktestStage, publishBacktestSnapshot } from './backtest-materialization-publication.js';
import type { BacktestSnapshotBuilder } from './backtest-run.service.js';
import { hashCanonicalManifest, type LocalSnapshotStore } from './backtest-snapshot.js';
import { BacktestSnapshotUnavailableError, asRecord, createdSnapshotManifest, runExecutionRouteKey, snapshotSourcePurposes } from './backtest-v3-run-lifecycle.js';

export async function materializeStockBacktest(input: { prisma: PrismaService; job: BacktestJob;
  snapshots: LocalSnapshotStore; builder?: BacktestSnapshotBuilder | undefined;
  guard?: Pick<BacktestCreationGuardService, 'check'> | undefined; signal: AbortSignal }) {
  const { job, prisma, signal, snapshots, builder, guard } = input;
  const materialization = readBacktestMaterialization(job.input);
  if (job.snapshotId) return job;
  if (!materialization || materialization.kind !== 'configured')
    throw new BacktestSnapshotUnavailableError('Run缺少可物化的创建意图或可信冻结快照。');
  await advanceBacktestStage(prisma, job, signal, 'preparing');
  const version = await prisma.strategyVersion.findUnique({ where: { id: job.strategyVersionId } });
  const strategy = strategySchema.parse(version?.schema) as BacktestStrategy;
  if (hashCanonicalManifest(strategy) !== materialization.strategyVersionHash)
    throw new ConflictException({ code: 'PREPARATION_STALE', message: '策略版本与已保存创建意图不符，请重新准备。' });
  const request = backtestRunCreateSchemaV3.parse({ contractVersion: 1,
    strategyVersionId: job.strategyVersionId, idempotencyKey: job.idempotencyKey,
    runConfig: job.runConfig, preparationStamp: asRecord(job.input)?.preparationStamp });
  const executionRouteKey = runExecutionRouteKey(strategy, request.runConfig);
  const identity = { request, strategy, runConfig: request.runConfig, runId: job.id,
    executionRouteKey, expectedSourcePurposes: snapshotSourcePurposes(strategy, request.runConfig) };
  // 完成文件但尚未关联的前一attempt可复用，绝不混用半套文件。
  for (const attempt of [job.executionAttempt, job.executionAttempt - 1].filter((value) => value > 0)) {
    signal.throwIfAborted();
    const store = snapshots.forAttempt(job.id, attempt);
    const existing = await store.v3.load(job.id, true);
    if (!existing || existing.status !== 'finalized') continue;
    const manifest = await store.v3.replay(job.id);
    const checked = createdSnapshotManifest({ manifest, artifactRefs: manifest.artifacts,
      snapshotRef: { snapshotId: manifest.contentHash!, contentHash: manifest.contentHash! } }, identity);
    if (checked.quality.completeness !== 'complete') throw new BacktestSnapshotUnavailableError('已完成快照依赖不完整。');
    return publishBacktestSnapshot(prisma, job, signal, checked, attempt, checked.quality.warnings);
  }
  if (!builder || !guard) throw new BacktestSnapshotUnavailableError('快照构建器或准备复核未配置。');
  await guard.check(request, strategy);
  signal.throwIfAborted();
  const built = await builder.buildV3({ runId: job.id, strategyVersionId: job.strategyVersionId,
    strategyVersionHash: materialization.strategyVersionHash, strategy, runConfig: request.runConfig,
    executionRouteKey, preparationStamp: request.preparationStamp, signal,
    beforeFinalize: async () => {
      await advanceBacktestStage(prisma, job, signal, 'freezing');
      await guard.check(request, strategy);
      signal.throwIfAborted();
    },
  }, snapshots.forAttempt(job.id, job.executionAttempt));
  const manifest = createdSnapshotManifest(built, identity);
  if (manifest.quality.completeness !== 'complete') throw new BacktestSnapshotUnavailableError('Snapshot V3依赖闭包不完整。');
  return publishBacktestSnapshot(prisma, job, signal, manifest, job.executionAttempt, manifest.quality.warnings);
}
