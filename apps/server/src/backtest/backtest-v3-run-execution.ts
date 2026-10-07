import { BadRequestException } from '@nestjs/common';
import type { BacktestJob } from '@prisma/client';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import {
  backtestResultSchemaV3,
  backtestSnapshotManifestV3Schema,
  runConfigSchemaV3,
  type BacktestSnapshotManifestV3,
  type BacktestResultV3,
} from '@thesis-ledger/schemas';
import { BacktestSnapshotUnavailableError, asRecord } from './backtest-v3-run-lifecycle.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import type { LocalSnapshotStore } from './backtest-snapshot.js';
import type { BacktestV3Runner } from './backtest-v3-runner.js';

interface BacktestV3RunExecutionInput {
  job: BacktestJob;
  runner: BacktestV3Runner;
  snapshots: LocalSnapshotStore;
  signal: AbortSignal;
}

export type VerifiedBacktestV3Snapshot = BacktestSnapshotManifestV3 & {
  contentHash: string;
  comparableDataFingerprint: string;
};

const unavailable = (message: string): BacktestSnapshotUnavailableError =>
  new BacktestSnapshotUnavailableError(message);

const badResult = (message: string): BadRequestException => new BadRequestException(message);

export async function loadVerifiedBacktestV3Snapshot(
  job: BacktestJob,
  snapshots: LocalSnapshotStore,
): Promise<VerifiedBacktestV3Snapshot> {
  const persisted = backtestSnapshotManifestV3Schema.safeParse(job.snapshotManifest);
  if (!persisted.success) {
    throw unavailable('V3 Run 持久化 Snapshot manifest 无效');
  }

  const manifest = persisted.data;
  const contentHash = manifest.contentHash;
  const comparableDataFingerprint = manifest.comparableDataFingerprint;
  if (!contentHash || !comparableDataFingerprint) {
    throw unavailable('V3 Run finalized Snapshot 缺少冻结 hash');
  }
  const input = asRecord(job.input);
  const storedRunConfig = runConfigSchemaV3.safeParse(job.runConfig);
  const inputRunConfig = runConfigSchemaV3.safeParse(input?.runConfig);
  if (!storedRunConfig.success || !inputRunConfig.success) {
    throw unavailable('V3 Run 持久化 RunConfig 无效');
  }
  const runConfig = storedRunConfig.data;
  const runConfigChecksum = hashCanonicalManifest(runConfig);
  const inputRunConfigChecksum = hashCanonicalManifest(inputRunConfig.data);
  const expectedPeriodStart = new Date(`${runConfig.startDate}T00:00:00.000Z`).getTime();
  const expectedPeriodEnd = new Date(`${runConfig.endDate}T00:00:00.000Z`).getTime();
  const expectedDataAsOf = new Date(runConfig.dataAsOf).getTime();
  if (
    job.mode !== 'V3' ||
    job.strategyVersionId !== manifest.strategyVersionId ||
    manifest.runId !== job.id ||
    manifest.status !== 'finalized' ||
    manifest.quality.completeness !== 'complete' ||
    job.snapshotId !== contentHash ||
    input?.contractVersion !== 3 ||
    input.schemaVersion !== '3' ||
    input.strategyVersionId !== manifest.strategyVersionId ||
    input.snapshotId !== manifest.contentHash ||
    input.snapshotVersion !== manifest.manifestVersion ||
    runConfigChecksum !== inputRunConfigChecksum ||
    runConfigChecksum !== manifest.runConfigChecksum ||
    runConfig.startDate !== manifest.dateRange.startDate ||
    runConfig.endDate !== manifest.dateRange.endDate ||
    runConfig.dataAsOf !== manifest.dataAsOf ||
    canonicalizeManifest(runConfig.executionPriceProtocol) !==
      canonicalizeManifest(manifest.executionPriceProtocol) ||
    job.periodStart.getTime() !== expectedPeriodStart ||
    job.periodEnd.getTime() !== expectedPeriodEnd ||
    job.dataAsOf.getTime() !== expectedDataAsOf
  ) {
    throw unavailable('V3 Run 持久化配置与冻结 Snapshot 不一致');
  }

  let replayed: Awaited<ReturnType<LocalSnapshotStore['v3']['replay']>>;
  try {
    replayed = await snapshots.v3.replay(job.id);
  } catch {
    throw unavailable('V3 Snapshot 无法通过 Store replay 完整性校验');
  }
  const replayedManifest = backtestSnapshotManifestV3Schema.safeParse(replayed);
  if (
    !replayedManifest.success ||
    replayedManifest.data.status !== 'finalized' ||
    replayedManifest.data.quality.completeness !== 'complete' ||
    !replayedManifest.data.contentHash ||
    !replayedManifest.data.comparableDataFingerprint ||
    replayedManifest.data.contentHash !== manifest.contentHash ||
    canonicalizeManifest(replayedManifest.data) !== canonicalizeManifest(manifest)
  ) {
    throw unavailable('V3 Run 冻结 manifest 与 Store replay 不一致');
  }

  return { ...manifest, contentHash, comparableDataFingerprint };
}

export async function executeBacktestV3Run({
  job,
  runner,
  snapshots,
  signal,
}: BacktestV3RunExecutionInput): Promise<{
  result: BacktestResultV3;
  resultChecksum: string;
}> {
  const manifest = await loadVerifiedBacktestV3Snapshot(job, snapshots);

  const result = await runner.run(
    {
      runId: job.id,
      snapshotRef: { snapshotId: manifest.contentHash, contentHash: manifest.contentHash },
      artifactRefs: manifest.artifacts,
    },
    signal,
  );

  let parsedResult: BacktestResultV3;
  try {
    parsedResult = backtestResultSchemaV3.parse(result);
  } catch {
    throw badResult('V3 Runner Result 不符合严格 Schema');
  }

  if (
    parsedResult.runId !== manifest.runId ||
    parsedResult.strategyVersionId !== manifest.strategyVersionId ||
    parsedResult.snapshotId !== manifest.contentHash ||
    parsedResult.snapshotVersion !== manifest.manifestVersion ||
    parsedResult.contentHash !== manifest.contentHash ||
    parsedResult.engineVersion !== runner.id ||
    parsedResult.marketRuleVersion !== manifest.marketRuleVersion ||
    parsedResult.calendarVersion !== manifest.calendarVersion ||
    parsedResult.aggregationVersion !== manifest.aggregationVersion ||
    canonicalizeManifest(parsedResult.executionPriceProtocol) !==
      canonicalizeManifest(manifest.executionPriceProtocol) ||
    canonicalizeManifest(parsedResult.actualSources) !==
      canonicalizeManifest(manifest.actualSources) ||
    parsedResult.comparableDataFingerprint !== manifest.comparableDataFingerprint
  ) {
    throw badResult('V3 Result 与冻结 Snapshot 身份不一致');
  }

  if (manifest.executionModel) {
    const disclosure = parsedResult.executionModelDisclosure;
    if (
      !disclosure ||
      disclosure.contentHash !== manifest.executionModel.contentHash ||
      hashCanonicalManifest(disclosure.model) !== manifest.executionModel.contentHash
    ) {
      throw badResult('V3 Result execution model disclosure 与冻结模型不一致');
    }
  } else if (parsedResult.executionModelDisclosure) {
    throw badResult('V3 Result 声明了 Snapshot 未冻结的 execution model');
  }

  const { resultChecksum, ...checksumPayload } = parsedResult;
  if (deterministicResultChecksum(checksumPayload) !== resultChecksum) {
    throw badResult('V3 Result canonical resultChecksum 不匹配');
  }

  return { result: parsedResult, resultChecksum };
}
