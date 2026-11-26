import type { BacktestJob } from '@prisma/client';
import { strategySchema } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import { validateNavPreparationReceipt } from './backtest-nav-preparation-receipt.js';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import { BacktestSnapshotUnavailableError } from './backtest-v3-run-lifecycle.js';
import { readBacktestMaterialization } from './backtest-job-materialization-input.js';
import { advanceBacktestStage, publishBacktestSnapshot } from './backtest-materialization-publication.js';
import { navSnapshotStoreForJob, verifyNavRunForRead } from './backtest-nav-run-read.js';
import type { LocalNavSnapshotStore, NavSnapshotFreezeInput } from './backtest-nav-snapshot-store.js';
import { asRecord } from './backtest-v3-run-lifecycle.js';
import { frozenReplaySource } from './backtest-runner-replay.js';

export async function loadNavRunPreparation(prisma: PrismaService, job: BacktestJob) {
  const ownerId = asRecord(job.input)?.preparationRunId ?? job.id;
  let consumedAt = job.createdAt;
  if (ownerId !== job.id) {
    const intent = readBacktestMaterialization(job.input);
    if (typeof ownerId !== 'string' || intent?.kind !== 'frozen-replay')
      throw new BacktestSnapshotUnavailableError('NAV准备凭证归属无效。');
    const original = await prisma.backtestJob.findUnique({ where: { id: ownerId } });
    if (!original || original.strategyVersionId !== job.strategyVersionId ||
      hashCanonicalManifest(original.runConfig) !== hashCanonicalManifest(job.runConfig) ||
      asRecord(original.input)?.preparationId !== asRecord(job.input)?.preparationId ||
      asRecord(original.input)?.preparationHash !== asRecord(job.input)?.preparationHash)
      throw new BacktestSnapshotUnavailableError('NAV准备凭证原Run关联不一致。');
    consumedAt = original.createdAt;
  }
  const preparation = await prisma.navBacktestPreparation.findUnique({ where: { consumedRunId: String(ownerId) } });
  if (!preparation) throw new BacktestSnapshotUnavailableError('NAV Run缺少已消费准备凭证。');
  const prepared = await validateNavPreparationReceipt(preparation, () => consumedAt.getTime());
  const version = await prisma.strategyVersion.findUnique({ where: { id: job.strategyVersionId } });
  const strategy = strategySchema.safeParse(version?.schema);
  if ((version?.schemaVersion ?? 0) !== 1 || !strategy.success ||
    hashCanonicalManifest(strategy.data) !== prepared.binding.strategyContentHash)
    throw new BacktestSnapshotUnavailableError('NAV Run策略与准备凭证不一致。');
  return { preparation, prepared };
}

export async function materializeNavBacktest(prisma: PrismaService, job: BacktestJob,
  snapshots: LocalNavSnapshotStore, signal: AbortSignal) {
  if (job.snapshotId) return job;
  const intent = readBacktestMaterialization(job.input);
  if (!intent) throw new BacktestSnapshotUnavailableError('NAV Run缺少可物化输入。');
  await advanceBacktestStage(prisma, job, signal, 'preparing');
  const { preparation, prepared } = await loadNavRunPreparation(prisma, job);
  await verifyNavRunForRead({ job, preparation, prepared, snapshots });
  await advanceBacktestStage(prisma, job, signal, 'freezing');
  for (const attempt of [job.executionAttempt, job.executionAttempt - 1].filter((value) => value > 0)) {
    let completed;
    try { completed = await snapshots.forAttempt(job.id, attempt).replay(job.id); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    const candidate = { ...job, snapshotId: completed.manifest.contentHash, snapshotManifest: completed.manifest,
      input: { ...asRecord(job.input), snapshotStorageAttempt: attempt } as BacktestJob['input'] };
    await verifyNavRunForRead({ job: candidate, preparation, prepared, snapshots });
    return publishBacktestSnapshot(prisma, job, signal, completed.manifest, attempt);
  }
  const response = prepared.selection.response;
  let freezeInput: NavSnapshotFreezeInput = { runId: job.id,
    strategyVersionId: job.strategyVersionId, facts: prepared.facts, context: prepared.context,
    source: { ...response.source, routeKey: response.routeKey,
      target: { providerId: response.routeTarget.providerId, upstreamSource: response.routeTarget.upstreamSource },
      policyRevision: response.effectivePolicyRevision } };
  if (intent.kind === 'frozen-replay') {
    if (intent.targetRunnerId !== job.engineVersion) throw new BacktestSnapshotUnavailableError('NAV重放执行器身份不符。');
    const source = await frozenReplaySource(prisma, job);
    const bound = await loadNavRunPreparation(prisma, source);
    await verifyNavRunForRead({ job: source, ...bound, snapshots });
    const original = await navSnapshotStoreForJob(source, snapshots).replay(source.id);
    freezeInput = { runId: job.id, strategyVersionId: job.strategyVersionId,
      facts: original.manifest.facts, context: original.context, source: original.manifest.source };
  }
  const frozen = await snapshots.forAttempt(job.id, job.executionAttempt).freeze(freezeInput);
  signal.throwIfAborted();
  return publishBacktestSnapshot(prisma, job, signal, frozen, job.executionAttempt);
}
