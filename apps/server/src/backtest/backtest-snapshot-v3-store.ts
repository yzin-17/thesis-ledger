import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  backtestSnapshotManifestV3Schema,
  type BacktestSnapshotManifestV3,
} from '@thesis-ledger/schemas';
import { assertSnapshotV3PitExecutionAvailable } from './backtest-snapshot-v3-pit-guard.js';
import {
  readSnapshotArtifactRowsV3,
  validateSnapshotInputsV3,
} from './backtest-snapshot-v3-validation.js';
import { comparableSnapshotRowsV3 } from './backtest-snapshot-v3-comparable-data.js';
import type {
  ArtifactPutInput,
  ArtifactRef,
  ArtifactRow,
  LocalArtifactStore,
} from './backtest-artifact-store.js';

type PutArtifact = (
  runId: string,
  input: Omit<ArtifactPutInput, 'key'> & { key: string },
) => Promise<ArtifactRef>;

interface V3SnapshotStoreDependencies {
  rootDirectory: string;
  artifacts: LocalArtifactStore;
  putArtifact: PutArtifact;
  canonicalize: (value: unknown) => string;
  hash: (value: unknown) => string;
  integrityError: (message: string) => Error;
}

export class SnapshotV3NotFoundError extends Error {
  readonly code = 'SNAPSHOT_NOT_FOUND';
}

const buildingIdentity = (
  manifest: BacktestSnapshotManifestV3,
  canonicalize: (value: unknown) => string,
) => {
  const identity = Object.fromEntries(
    Object.entries(manifest).filter(
      ([key]) => !['artifacts', 'contentHash', 'status', 'comparableDataFingerprint'].includes(key),
    ),
  );
  return canonicalize(identity);
};

export class LocalSnapshotV3Store {
  constructor(private readonly dependencies: V3SnapshotStoreDependencies) {}

  private fail(message: string): never {
    throw this.dependencies.integrityError(message);
  }

  private runDirectory(runId: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) throw new Error('Invalid runId');
    return resolve(this.dependencies.rootDirectory, 'snapshots', runId);
  }

  private async writeManifest(
    path: string,
    manifest: BacktestSnapshotManifestV3,
    exclusive = false,
  ): Promise<void> {
    const staging = `${path}.staging-${randomUUID()}`;
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(staging, `${this.dependencies.canonicalize(manifest)}\n`, { flag: 'wx' });
      if (exclusive) await link(staging, path);
      else await rename(staging, path);
    } finally {
      await rm(staging, { force: true });
    }
  }

  async putArtifact(
    runId: string,
    input: Omit<ArtifactPutInput, 'key'> & { key: string },
  ): Promise<ArtifactRef> {
    return this.dependencies.putArtifact(runId, input);
  }

  async load(runId: string, allowMissing = false): Promise<BacktestSnapshotManifestV3 | undefined> {
    for (const filename of ['finalized.json', 'building.json']) {
      try {
        const raw = await readFile(resolve(this.runDirectory(runId), filename), 'utf8');
        let manifest: BacktestSnapshotManifestV3;
        try {
          manifest = backtestSnapshotManifestV3Schema.parse(JSON.parse(raw) as unknown);
        } catch {
          this.fail(`Snapshot V3 manifest is invalid: ${runId}`);
        }
        if (manifest.runId !== runId) {
          this.fail(`Snapshot V3 directory identity mismatch: ${runId}`);
        }
        if (manifest.status !== (filename === 'finalized.json' ? 'finalized' : 'building')) {
          this.fail(`Snapshot V3 file state mismatch: ${runId}`);
        }
        if (
          manifest.status === 'finalized' &&
          manifest.contentHash !== this.dependencies.hash(manifest)
        ) {
          this.fail(`Snapshot V3 manifest hash mismatch: ${runId}`);
        }
        return manifest;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
    }
    if (allowMissing) return undefined;
    throw new SnapshotV3NotFoundError(`Snapshot V3 not found: ${runId}`);
  }

  async startBuild(manifest: BacktestSnapshotManifestV3): Promise<BacktestSnapshotManifestV3> {
    if (manifest.status !== 'building') this.fail('Snapshot V3 must start in building state');
    const existing = await this.load(manifest.runId, true);
    if (existing?.status === 'finalized') {
      if (
        buildingIdentity(existing, this.dependencies.canonicalize) !==
        buildingIdentity(manifest, this.dependencies.canonicalize)
      ) {
        this.fail(`Finalized Snapshot V3 identity mismatch: ${manifest.runId}`);
      }
      return this.replay(manifest.runId);
    }
    await rm(this.runDirectory(manifest.runId), { recursive: true, force: true });
    await rm(resolve(this.dependencies.rootDirectory, 'staging', manifest.runId), {
      recursive: true,
      force: true,
    });
    await rm(resolve(this.dependencies.rootDirectory, 'artifacts', manifest.runId), {
      recursive: true,
      force: true,
    });
    await this.writeManifest(resolve(this.runDirectory(manifest.runId), 'building.json'), manifest);
    return manifest;
  }

  private async comparableDataFingerprint(
    manifest: BacktestSnapshotManifestV3,
    artifacts: readonly ArtifactRef[],
  ): Promise<string> {
    const records: Array<{ key: string; rows: ArtifactRow[] }> = [];
    const range = manifest.dateRange;
    for (const artifact of artifacts) {
      if (!artifact.key.startsWith(`${manifest.runId}/`))
        this.fail('Snapshot V3 artifact does not belong to run');
      const key = artifact.key.slice(manifest.runId.length + 1);
      if (key.startsWith('metadata/')) continue;
      const storedRows = await readSnapshotArtifactRowsV3(this.dependencies.artifacts, artifact);
      const rows = comparableSnapshotRowsV3(key, storedRows, range);
      rows.sort((left, right) =>
        this.dependencies.canonicalize(left).localeCompare(this.dependencies.canonicalize(right)),
      );
      records.push({ key, rows });
    }
    records.sort((left, right) => left.key.localeCompare(right.key));
    if (records.length === 0 || records.every((record) => record.rows.length === 0)) {
      this.fail('Snapshot V3 has no comparable data artifacts in execution range');
    }
    return this.dependencies.hash(records);
  }

  async finalize(
    runId: string,
    manifest: BacktestSnapshotManifestV3,
    artifacts: readonly ArtifactRef[],
  ): Promise<BacktestSnapshotManifestV3> {
    if (manifest.runId !== runId || manifest.status !== 'building') {
      this.fail('Snapshot V3 is not a building manifest');
    }
    assertSnapshotV3PitExecutionAvailable(manifest);
    const persisted = await this.load(runId, true);
    if (persisted) assertSnapshotV3PitExecutionAvailable(persisted);
    if (!persisted) this.fail(`Building Snapshot V3 is missing: ${runId}`);
    if (persisted.status === 'finalized') {
      const candidate = await this.finalizedManifest(manifest, artifacts);
      if (persisted.contentHash === candidate.contentHash) return this.replay(runId);
      this.fail(`Finalized Snapshot V3 already differs: ${runId}`);
    }
    if (
      buildingIdentity(persisted, this.dependencies.canonicalize) !==
      buildingIdentity(manifest, this.dependencies.canonicalize)
    ) {
      this.fail(`Building Snapshot V3 identity mismatch: ${runId}`);
    }
    if (manifest.quality.completeness !== 'unavailable' && artifacts.length === 0) {
      this.fail('Complete or partial Snapshot V3 requires at least one artifact');
    }
    await this.inspectArtifacts(runId, artifacts);
    const finalized = await this.finalizedManifest(manifest, artifacts);
    await this.validateInputs(finalized, artifacts);
    try {
      await this.writeManifest(
        resolve(this.runDirectory(runId), 'finalized.json'),
        finalized,
        true,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const concurrent = await this.load(runId, true);
      if (concurrent?.status === 'finalized' && concurrent.contentHash === finalized.contentHash)
        return this.replay(runId);
      this.fail(`Concurrent finalized Snapshot V3 differs: ${runId}`);
    }
    await rm(resolve(this.runDirectory(runId), 'building.json'), { force: true });
    await rm(resolve(this.dependencies.rootDirectory, 'staging', runId), {
      recursive: true,
      force: true,
    });
    return finalized;
  }

  private async validateInputs(
    manifest: BacktestSnapshotManifestV3,
    artifacts: readonly ArtifactRef[],
  ): Promise<void> {
    await validateSnapshotInputsV3(manifest, artifacts, this.dependencies);
  }

  private async finalizedManifest(
    manifest: BacktestSnapshotManifestV3,
    artifacts: readonly ArtifactRef[],
  ): Promise<BacktestSnapshotManifestV3> {
    const candidate = {
      ...manifest,
      comparableDataFingerprint: await this.comparableDataFingerprint(manifest, artifacts),
      artifacts: [...artifacts].sort((left, right) => left.key.localeCompare(right.key)),
      status: 'finalized' as const,
    };
    const finalized = { ...candidate, contentHash: this.dependencies.hash(candidate) };
    try {
      return backtestSnapshotManifestV3Schema.parse(finalized);
    } catch {
      this.fail(`Finalized Snapshot V3 manifest violates its schema: ${manifest.runId}`);
    }
  }

  private async inspectArtifacts(runId: string, artifacts: readonly ArtifactRef[]): Promise<void> {
    for (const artifact of artifacts) {
      if (!artifact.key.startsWith(`${runId}/`)) this.fail('Artifact does not belong to run');
      if (!(await this.dependencies.artifacts.exists(artifact))) {
        this.fail(`Snapshot V3 artifact is missing: ${artifact.key}`);
      }
      await this.dependencies.artifacts.inspect(artifact);
    }
  }

  async replay(runId: string): Promise<BacktestSnapshotManifestV3> {
    const manifest = await this.load(runId);
    if (!manifest || manifest.status !== 'finalized') {
      this.fail(`Snapshot V3 ${runId} is not finalized`);
    }
    assertSnapshotV3PitExecutionAvailable(manifest);
    await this.inspectArtifacts(runId, manifest.artifacts);
    const fingerprint = await this.comparableDataFingerprint(manifest, manifest.artifacts);
    if (fingerprint !== manifest.comparableDataFingerprint) {
      this.fail(`Snapshot V3 comparable-data fingerprint mismatch: ${runId}`);
    }
    await this.validateInputs(manifest, manifest.artifacts);
    return manifest;
  }

  async deleteRun(runId: string): Promise<void> {
    this.runDirectory(runId);
    await rm(this.runDirectory(runId), { recursive: true, force: true });
    await rm(resolve(this.dependencies.rootDirectory, 'staging', runId), {
      recursive: true,
      force: true,
    });
    await rm(resolve(this.dependencies.rootDirectory, 'artifacts', runId), {
      recursive: true,
      force: true,
    });
  }
}
