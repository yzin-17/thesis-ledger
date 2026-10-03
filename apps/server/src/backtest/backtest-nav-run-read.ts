import { ConflictException } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import {
  backtestNavRunConfigV3Schema,
  backtestNavRunResponseV3Schema,
  type BacktestNavRunConfigV3,
  type BacktestNavRunResponseV3,
} from '@thesis-ledger/schemas';
import type { NavRunPreparationV3 } from './backtest-nav-preparation.js';
import { ArtifactCorruptionError, ArtifactNotFoundError } from './backtest-artifact-store.js';
import {
  canonicalizeManifest,
  hashCanonicalManifest,
  SnapshotIntegrityError,
} from './backtest-snapshot.js';
import type { LocalNavSnapshotStore } from './backtest-nav-snapshot-store.js';
import { verifyNavResultForRead } from './backtest-nav-result-read.js';

type NavJobRecord = {
  id: string;
  mode: string;
  strategyVersionId: string;
  idempotencyKey: string | null;
  status: string;
  stage: string | null;
  progress: number;
  executionAttempt: number;
  periodStart: Date;
  periodEnd: Date;
  dataAsOf: Date;
  runConfig: unknown;
  input: unknown;
  snapshotId: string | null;
  snapshotManifest: unknown;
  errorCode: string | null;
  errorSummary: string | null;
  engineVersion: string | null;
  resultChecksum: string | null;
  result: unknown;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

type NavPreparationRecord = {
  id: string;
  strategyVersionId: string;
  preparationHash: string;
  consumedRunId: string | null;
};

type StoredRunConfig = {
  runConfig: BacktestNavRunConfigV3;
  inputConfig: BacktestNavRunConfigV3;
  preparationId: string;
  preparationHash: string;
  idempotencyKey: string;
};

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export const isNavBacktestInput = (input: unknown): boolean => {
  const value = record(input);
  const runConfig = record(value?.runConfig);
  return value?.inputKind === 'nav' || runConfig?.navInput !== undefined;
};

const invalid = (): never => {
  throw new ConflictException({
    code: 'NAV_RUN_INTEGRITY_INVALID',
    message: 'NAV Run 持久化记录或冻结证据不符合现行合同',
  });
};

function storedRunConfig(job: NavJobRecord): StoredRunConfig {
  const input = record(job.input);
  const runConfig = backtestNavRunConfigV3Schema.safeParse(job.runConfig);
  const inputConfig = backtestNavRunConfigV3Schema.safeParse(input?.runConfig);
  const preparationId = input?.preparationId;
  const preparationHash = input?.preparationHash;
  if (!runConfig.success || !inputConfig.success) return invalid();
  if (typeof preparationId !== 'string' || typeof preparationHash !== 'string') return invalid();
  if (!job.idempotencyKey) return invalid();
  if (
    job.mode !== 'V3' ||
    input?.contractVersion !== 3 ||
    input.schemaVersion !== '3' ||
    input.inputKind !== 'nav'
  ) {
    return invalid();
  }
  return {
    runConfig: runConfig.data,
    inputConfig: inputConfig.data,
    preparationId,
    preparationHash,
    idempotencyKey: job.idempotencyKey,
  };
}

function assertPreparationBinding(
  job: NavJobRecord,
  preparation: NavPreparationRecord,
  prepared: NavRunPreparationV3,
  stored: StoredRunConfig,
): void {
  if (
    stored.preparationId !== preparation.id ||
    stored.preparationHash !== preparation.preparationHash ||
    preparation.consumedRunId !== job.id ||
    preparation.strategyVersionId !== job.strategyVersionId ||
    prepared.binding.strategyVersionId !== job.strategyVersionId ||
    prepared.binding.preparationHash !== preparation.preparationHash
  ) {
    invalid();
  }
}

function assertRunConfigBinding(
  job: NavJobRecord,
  prepared: NavRunPreparationV3,
  stored: StoredRunConfig,
): void {
  if (
    hashCanonicalManifest(stored.runConfig) !== hashCanonicalManifest(stored.inputConfig) ||
    hashCanonicalManifest(stored.runConfig) !== hashCanonicalManifest(prepared.runConfig) ||
    job.periodStart.toISOString().slice(0, 10) !== stored.runConfig.startDate ||
    job.periodEnd.toISOString().slice(0, 10) !== stored.runConfig.endDate ||
    Date.parse(job.dataAsOf.toISOString()) !== Date.parse(stored.runConfig.dataAsOf)
  ) {
    invalid();
  }
}

function assertManifestBinding(
  job: NavJobRecord,
  prepared: NavRunPreparationV3,
  runConfig: BacktestNavRunConfigV3,
  replay: Awaited<ReturnType<LocalNavSnapshotStore['replay']>>,
): void {
  const manifest = replay.manifest;
  assertManifestSourceAndFacts(manifest, prepared);
  assertReplayContextAndPlan(prepared, replay);
  if (
    manifest.contentHash !== job.snapshotId ||
    manifest.contentHash !== hashCanonicalManifest(manifest) ||
    !isDeepStrictEqual(manifest, job.snapshotManifest) ||
    manifest.runId !== job.id ||
    manifest.strategyVersionId !== job.strategyVersionId ||
    manifest.strategyVersionHash !== prepared.binding.strategyContentHash
  ) {
    invalid();
  }
  if (
    manifest.runConfigChecksum !== hashCanonicalManifest(runConfig) ||
    manifest.dataAsOf !== runConfig.dataAsOf ||
    hashCanonicalManifest(replay.context.runConfig) !== hashCanonicalManifest(runConfig) ||
    hashCanonicalManifest(replay.context.strategy) !== prepared.binding.strategyContentHash
  ) {
    invalid();
  }
}

function assertManifestSourceAndFacts(
  manifest: Awaited<ReturnType<LocalNavSnapshotStore['replay']>>['manifest'],
  prepared: NavRunPreparationV3,
): void {
  const response = prepared.selection.response;
  const expectedSource = {
    ...response.source,
    routeKey: response.routeKey,
    target: {
      providerId: response.routeTarget.providerId,
      upstreamSource: response.routeTarget.upstreamSource,
    },
    policyRevision: response.effectivePolicyRevision,
  };
  if (
    canonicalizeManifest(manifest.source) !== canonicalizeManifest(expectedSource) ||
    canonicalizeManifest(manifest.facts) !== canonicalizeManifest(prepared.facts)
  ) {
    invalid();
  }
}

function assertReplayContextAndPlan(
  prepared: NavRunPreparationV3,
  replay: Awaited<ReturnType<LocalNavSnapshotStore['replay']>>,
): void {
  if (
    canonicalizeManifest(replay.context) !== canonicalizeManifest(prepared.context) ||
    canonicalizeManifest(replay.plan) !== canonicalizeManifest(prepared.plan) ||
    hashCanonicalManifest(replay.plan) !== prepared.binding.inputPlanHash
  ) {
    invalid();
  }
}

async function replayManifest(
  job: NavJobRecord,
  snapshots: LocalNavSnapshotStore,
): Promise<Awaited<ReturnType<LocalNavSnapshotStore['replay']>> | null> {
  const hasSnapshotId = job.snapshotId !== null;
  const hasManifest = job.snapshotManifest !== null && job.snapshotManifest !== undefined;
  if (!hasSnapshotId && !hasManifest) {
    if (job.errorCode === 'NAV_SNAPSHOT_INVALID' && job.status === 'failed') return null;
    return invalid();
  }
  if (!hasSnapshotId || !hasManifest) return invalid();
  try {
    return await snapshots.replay(job.id);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (
      error instanceof SnapshotIntegrityError ||
      error instanceof ArtifactCorruptionError ||
      error instanceof ArtifactNotFoundError ||
      code === 'ENOENT'
    ) {
      return invalid();
    }
    throw error;
  }
}

function responseForRead(
  job: NavJobRecord,
  runConfig: BacktestNavRunConfigV3,
  stored: StoredRunConfig,
  manifest: unknown,
  result: ReturnType<typeof verifyNavResultForRead>,
): BacktestNavRunResponseV3 {
  const response = {
    contractVersion: 3,
    schemaVersion: '3',
    inputKind: 'nav',
    id: job.id,
    strategyVersionId: job.strategyVersionId,
    preparationId: stored.preparationId,
    preparationHash: stored.preparationHash,
    idempotencyKey: stored.idempotencyKey,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    periodStart: job.periodStart.toISOString(),
    periodEnd: job.periodEnd.toISOString(),
    dataAsOf: job.dataAsOf.toISOString(),
    runConfig,
    executionAttempt: job.executionAttempt,
    snapshotId: job.snapshotId,
    snapshotManifest: manifest,
    errorCode: job.errorCode,
    errorSummary: job.errorSummary,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    engineVersion: job.engineVersion ?? null,
    resultChecksum: job.resultChecksum ?? null,
    result,
  };
  try {
    return backtestNavRunResponseV3Schema.parse(response);
  } catch {
    return invalid();
  }
}

/** 读取只接受数据库关联、严格合同和物理 Parquet 回放同时一致的 NAV Run。 */
export async function verifyNavRunForRead(input: {
  job: NavJobRecord;
  preparation: NavPreparationRecord;
  prepared: NavRunPreparationV3;
  snapshots: LocalNavSnapshotStore;
}): Promise<BacktestNavRunResponseV3> {
  const { job, preparation, prepared, snapshots } = input;
  const stored = storedRunConfig(job);
  assertPreparationBinding(job, preparation, prepared, stored);
  assertRunConfigBinding(job, prepared, stored);
  const replay = await replayManifest(job, snapshots);
  if (replay) assertManifestBinding(job, prepared, stored.runConfig, replay);
  const result = verifyNavResultForRead(job, replay);
  return responseForRead(job, stored.runConfig, stored, replay?.manifest ?? null, result);
}
