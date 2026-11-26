import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma, BacktestJob } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import type { BacktestQueueService } from './backtest-queue.service.js';
import type { BacktestNavRunExecution } from './backtest-nav-run-execution.js';
import { isNavBacktestInput } from './backtest-nav-run-read.js';
import { readBacktestMaterialization } from './backtest-job-materialization-input.js';
import { loadVerifiedBacktestV3Snapshot, stockSnapshotStoreForJob } from './backtest-v3-run-execution.js';
import { asRecord, uniqueConstraintViolation } from './backtest-v3-run-lifecycle.js';
import { hashCanonicalManifest, type LocalSnapshotStore } from './backtest-snapshot.js';
import { advanceBacktestStage, publishBacktestSnapshot } from './backtest-materialization-publication.js';
import type { ArtifactRow } from './backtest-artifact-store.js';

const unavailable = (): never => { throw new ConflictException({ code: 'BACKTEST_FROZEN_REPLAY_UNAVAILABLE',
  message: '原Run缺少可信完整冻结输入，请重新准备后新建回测。' }); };

export async function frozenReplaySource(prisma: PrismaService, job: BacktestJob) {
  const intent = readBacktestMaterialization(job.input);
  if (job.snapshotId) return job;
  if (intent?.kind !== 'frozen-replay') return unavailable();
  const source = await prisma.backtestJob.findUnique({ where: { id: intent.sourceRunId } });
  if (!source || source.strategyVersionId !== job.strategyVersionId || source.snapshotId !== intent.sourceSnapshotId ||
    hashCanonicalManifest(source.runConfig) !== hashCanonicalManifest(job.runConfig)) return unavailable();
  return source;
}

export async function createBacktestRunnerReplay(options: { prisma: PrismaService; job: BacktestJob;
  runnerId: string; snapshots: LocalSnapshotStore; navExecution?: BacktestNavRunExecution | undefined;
  queue?: Pick<BacktestQueueService, 'ensureEnqueued'> | undefined }) {
  const { prisma, job, runnerId, snapshots, navExecution, queue } = options;
  const key = `runner-replay:${job.id}:${hashCanonicalManifest({ runnerId }).slice(0, 32)}`;
  const find = () => prisma.backtestJob.findFirst({ where: { strategyVersionId: job.strategyVersionId, idempotencyKey: key } });
  const checkedExisting = (existing: BacktestJob) => {
    const intent = readBacktestMaterialization(existing.input);
    if (intent?.kind !== 'frozen-replay' || intent.targetRunnerId !== runnerId ||
      asRecord(existing.input)?.replayOfRunId !== job.id ||
      hashCanonicalManifest(existing.runConfig) !== hashCanonicalManifest(job.runConfig))
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_CONFLICT', message: '关联Run幂等身份与已保存输入不一致。' });
    return existing;
  };
  const existing = await find();
  if (existing) return checkedExisting(existing);
  const source = await frozenReplaySource(prisma, job);
  let strategyVersionHash: string;
  const nav = isNavBacktestInput(source.input);
  if (nav) {
    if (!navExecution) return unavailable();
    strategyVersionHash = (await navExecution.loadVerified(source)).manifest.strategyVersionHash;
  } else strategyVersionHash = (await loadVerifiedBacktestV3Snapshot(source, snapshots)).strategyVersionHash;
  const original = { ...asRecord(source.input) };
  delete original.snapshotId;
  delete original.snapshotVersion;
  delete original.snapshotStorageAttempt;
  delete original.retryAttemptBase;
  delete original.materialization;
  const input = { ...original, replayOfRunId: job.id,
    ...(nav ? { preparationRunId: asRecord(source.input)?.preparationRunId ?? source.id } : {}),
    materialization: { version: 'backtest-job-input-v1', kind: 'frozen-replay', strategyVersionHash,
      sourceRunId: source.id, sourceSnapshotId: source.snapshotId!, targetRunnerId: runnerId } };
  try {
    const created = await prisma.backtestJob.create({ data: { id: randomUUID(), mode: 'frozen',
      strategyVersionId: job.strategyVersionId, idempotencyKey: key, status: 'queued', stage: 'queued', progress: 0,
      periodStart: source.periodStart, periodEnd: source.periodEnd, dataAsOf: source.dataAsOf,
      input, runConfig: source.runConfig as Prisma.InputJsonValue,
      executionAttempt: 0, engineVersion: runnerId, warnings: [] } });
    return await queue?.ensureEnqueued(created.id) ?? created;
  } catch (error) {
    if (uniqueConstraintViolation(error)) { const raced = await find(); if (raced) return checkedExisting(raced); }
    throw error;
  }
}

export async function materializeStockRunnerReplay(options: { prisma: PrismaService; job: BacktestJob;
  snapshots: LocalSnapshotStore; signal: AbortSignal }) {
  const { prisma, job, snapshots, signal } = options;
  const intent = readBacktestMaterialization(job.input);
  if (job.snapshotId || intent?.kind !== 'frozen-replay') return job;
  if (intent.targetRunnerId !== job.engineVersion) return unavailable();
  await advanceBacktestStage(prisma, job, signal, 'preparing');
  const source = await frozenReplaySource(prisma, job);
  const manifest = await loadVerifiedBacktestV3Snapshot(source, snapshots);
  if (manifest.strategyVersionHash !== intent.strategyVersionHash) return unavailable();
  for (const attempt of [job.executionAttempt, job.executionAttempt - 1].filter((value) => value > 0)) {
    const store = snapshots.forAttempt(job.id, attempt);
    const candidate = await store.v3.load(job.id, true);
    if (!candidate || candidate.status !== 'finalized') continue;
    const completed = await loadVerifiedBacktestV3Snapshot({ ...job, snapshotId: candidate.contentHash!,
      snapshotManifest: candidate,
      input: { ...asRecord(job.input), snapshotId: candidate.contentHash,
        snapshotVersion: candidate.manifestVersion, snapshotStorageAttempt: attempt } }, snapshots);
    if (completed.comparableDataFingerprint !== manifest.comparableDataFingerprint || completed.strategyVersionHash !== intent.strategyVersionHash)
      return unavailable();
    return publishBacktestSnapshot(prisma, job, signal, completed, attempt, completed.quality.warnings);
  }
  const sourceStore = stockSnapshotStoreForJob(source, snapshots);
  const targetStore = snapshots.forAttempt(job.id, job.executionAttempt);
  await advanceBacktestStage(prisma, job, signal, 'freezing');
  const { contentHash: _hash, comparableDataFingerprint: _data, ...base } = manifest;
  void _hash; void _data;
  const building = await targetStore.v3.startBuild({ ...base, runId: job.id, artifacts: [], status: 'building',
    ...(base.executionModel ? { executionModel: { ...base.executionModel,
      artifactKey: `${job.id}/${base.executionModel.artifactKey.slice(source.id.length + 1)}` } } : {}) });
  let frozen = building;
  if (building.status !== 'finalized') {
    const artifacts = [];
    for (const ref of manifest.artifacts) {
      signal.throwIfAborted(); const rows: ArtifactRow[] = [];
      for await (const row of await sourceStore.artifacts.openRead(ref)) { signal.throwIfAborted(); rows.push(row); }
      artifacts.push(await targetStore.v3.putArtifact(job.id, { key: ref.key.slice(source.id.length + 1), rows, artifactId: ref.artifactId }));
    }
    signal.throwIfAborted();
    frozen = await targetStore.v3.finalize(job.id, building, artifacts);
  } else frozen = await targetStore.v3.replay(job.id);
  if (frozen.comparableDataFingerprint !== manifest.comparableDataFingerprint || frozen.strategyVersionHash !== intent.strategyVersionHash)
    return unavailable();
  return publishBacktestSnapshot(prisma, job, signal, { ...frozen, contentHash: frozen.contentHash! }, job.executionAttempt, frozen.quality.warnings);
}
