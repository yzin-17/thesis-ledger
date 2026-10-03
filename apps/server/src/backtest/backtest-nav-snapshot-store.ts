import { randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  backtestNavSnapshotManifestV3Schema,
  type BacktestNavSnapshotManifestV3,
} from '@thesis-ledger/schemas';
import {
  LocalArtifactStore,
  type ArtifactRef,
  type ArtifactRow,
} from './backtest-artifact-store.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import { planNavSnapshotInputsV3 } from './backtest-nav-input-plan.js';
import {
  navContextRow,
  navFactRow,
  navIntegrityFailure,
  readNavContext,
  validateNavFrozenInputs,
  type NavFrozenContext,
} from './backtest-nav-freeze-validation.js';

export interface NavSnapshotFreezeInput {
  runId: string;
  strategyVersionId: string;
  source: BacktestNavSnapshotManifestV3['source'];
  facts: BacktestNavSnapshotManifestV3['facts'];
  context: NavFrozenContext;
}

const fingerprint = (manifest: BacktestNavSnapshotManifestV3) =>
  hashCanonicalManifest({
    inputKind: 'nav',
    symbol: manifest.navInput.symbol,
    facts: manifest.facts.filter((f) => f.valuationDate >= manifest.dateRange.startDate),
  });

const candidateManifest = (
  input: NavSnapshotFreezeInput,
  artifact: BacktestNavSnapshotManifestV3['artifact'],
  contextArtifact: BacktestNavSnapshotManifestV3['contextArtifact'],
): BacktestNavSnapshotManifestV3 => {
  const { runConfig, strategy, calendar } = input.context;
  const plan = planNavSnapshotInputsV3(input.context);
  const candidate: BacktestNavSnapshotManifestV3 = {
    manifestVersion: 'snapshot-manifest-v3',
    inputKind: 'nav',
    status: 'finalized',
    runId: input.runId,
    strategyVersionId: input.strategyVersionId,
    strategyVersionHash: hashCanonicalManifest(strategy),
    runConfigChecksum: hashCanonicalManifest(runConfig),
    dataAsOf: runConfig.dataAsOf,
    navInput: runConfig.navInput,
    navVisibility: runConfig.navVisibility,
    executionModel: {
      schemaVersion: 'execution-model-v1',
      id: runConfig.executionModel.id,
      version: runConfig.executionModel.version,
      contentHash: hashCanonicalManifest(runConfig.executionModel),
      artifactKey: 'metadata/nav-context-v3.parquet',
    },
    source: input.source,
    facts: input.facts,
    calendar: {
      market: calendar.market,
      timezone: calendar.timezone,
      version: calendar.version,
      contentHash: calendar.contentHash,
      evidenceRef: calendar.evidenceRef,
      availableAt: calendar.availableAt,
      expectedValuationDates: plan.expectedValuationDates,
    },
    dateRange: { ...plan.runWindow, warmupStartDate: plan.navRange.startDate },
    coverage: { complete: true, ...plan.navRange },
    artifact,
    contextArtifact,
    comparableDataFingerprint: '',
    contentHash: '',
  };
  candidate.comparableDataFingerprint = fingerprint(candidate);
  candidate.contentHash = hashCanonicalManifest(candidate);
  return validateNavFrozenInputs(candidate, input.context);
};

/** NAV 资产适配器与场内 Store 使用相同的目录和物理产物格式；N2 接通创建。 */
export class LocalNavSnapshotStore {
  readonly artifacts: LocalArtifactStore;
  constructor(private readonly rootDirectory: string) {
    this.artifacts = new LocalArtifactStore(resolve(rootDirectory, 'artifacts'));
  }

  private directory(runId: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) navIntegrityFailure('NAV runId 非法');
    return resolve(this.rootDirectory, 'snapshots', runId);
  }

  private async rows(ref: ArtifactRef): Promise<ArtifactRow[]> {
    const rows: ArtifactRow[] = [];
    for await (const row of await this.artifacts.openRead(ref)) rows.push(row);
    return rows;
  }

  private async verify(value: unknown, runId: string) {
    // 完整 Schema 核验在读取任何来自 manifest 的路径之前完成。
    const parsed = backtestNavSnapshotManifestV3Schema.safeParse(value);
    if (!parsed.success) navIntegrityFailure('NAV Snapshot 不是当前完整冻结格式');
    const manifest = parsed.data;
    if (manifest.runId !== runId || manifest.contentHash !== hashCanonicalManifest(manifest)) {
      navIntegrityFailure('NAV Snapshot runId 或 manifest 摘要不符');
    }
    const ref = (
      artifact:
        | BacktestNavSnapshotManifestV3['artifact']
        | BacktestNavSnapshotManifestV3['contextArtifact'],
    ): ArtifactRef => ({
      ...artifact,
      artifactId: artifact.contentHash,
      key: `${runId}/${artifact.key}`,
    });
    const context = readNavContext(await this.rows(ref(manifest.contextArtifact)));
    validateNavFrozenInputs(manifest, context);
    const rows = await this.rows(ref(manifest.artifact));
    if (
      canonicalizeManifest(rows) !== canonicalizeManifest(manifest.facts.map(navFactRow)) ||
      fingerprint(manifest) !== manifest.comparableDataFingerprint
    ) {
      navIntegrityFailure('NAV 净值 Parquet 或可比数据摘要不符');
    }
    return { manifest, context, plan: planNavSnapshotInputsV3(context) };
  }

  async replay(runId: string) {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(resolve(this.directory(runId), 'finalized.json'), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw error;
      navIntegrityFailure('NAV Snapshot manifest 无法解析');
    }
    return this.verify(value, runId);
  }

  async freeze(input: NavSnapshotFreezeInput): Promise<BacktestNavSnapshotManifestV3> {
    const runId = input.runId;
    const directory = this.directory(runId);
    const context = readNavContext([navContextRow(input.context)]);
    const captured: NavSnapshotFreezeInput = JSON.parse(
      canonicalizeManifest({ ...input, context }),
    ) as NavSnapshotFreezeInput;
    const placeholder = {
      format: 'parquet' as const,
      compression: 'zstd' as const,
      contentHash: '0'.repeat(64),
      sizeBytes: 1,
    };
    candidateManifest(
      captured,
      { ...placeholder, key: 'execution/nav.parquet' },
      { ...placeholder, key: 'metadata/nav-context-v3.parquet' },
    );
    await mkdir(directory, { recursive: true });
    const lockPath = resolve(directory, '.nav-freeze.lock');
    const lock = await open(lockPath, 'wx');
    const owned: ArtifactRef[] = [];
    let published = false;
    try {
      try {
        const existing = await this.replay(runId);
        const candidate = candidateManifest(
          captured,
          existing.manifest.artifact,
          existing.manifest.contextArtifact,
        );
        if (
          candidate.contentHash !== existing.manifest.contentHash ||
          canonicalizeManifest(navContextRow(context)) !==
            canonicalizeManifest(navContextRow(existing.context))
        ) {
          navIntegrityFailure('NAV 同一 Run 已冻结不同输入');
        }
        return existing.manifest;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        // finalized.json 存在但产物缺失时必须拒绝，不能重建已冻结输入。
        try {
          await readFile(resolve(directory, 'finalized.json'));
          navIntegrityFailure('NAV 已冻结产物缺失');
        } catch (missing) {
          if ((missing as NodeJS.ErrnoException).code !== 'ENOENT') throw missing;
        }
      }
      try {
        await readFile(resolve(directory, 'building.json'));
        navIntegrityFailure('NAV Run 目录已有其他构建，不能覆盖');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      const put = async (key: string, rows: ArtifactRow[]) => {
        const ref = await this.artifacts.put({
          key: `${runId}/${key}`,
          rows,
          artifactId: hashCanonicalManifest({ runId, key, rows }),
        });
        owned.push(ref);
        return ref;
      };
      const nav = await put('execution/nav.parquet', captured.facts.map(navFactRow));
      const ctx = await put('metadata/nav-context-v3.parquet', [navContextRow(context)]);
      // 不把 ArtifactRef 的内部 artifactId 写入严格的现行 Manifest。
      const finalized = candidateManifest(
        captured,
        {
          format: nav.format,
          compression: nav.compression,
          contentHash: nav.contentHash,
          sizeBytes: nav.sizeBytes,
          key: 'execution/nav.parquet',
        },
        {
          format: ctx.format,
          compression: ctx.compression,
          contentHash: ctx.contentHash,
          sizeBytes: ctx.sizeBytes,
          key: 'metadata/nav-context-v3.parquet',
        },
      );
      await this.verify(finalized, runId);
      const staging = resolve(directory, `finalized.json.staging-${randomUUID()}`);
      try {
        await writeFile(staging, `${canonicalizeManifest(finalized)}\n`, { flag: 'wx' });
        await link(staging, resolve(directory, 'finalized.json'));
        published = true;
      } finally {
        await rm(staging, { force: true });
      }
      return finalized;
    } finally {
      try {
        if (!published) for (const ref of owned) await this.artifacts.delete(ref);
      } finally {
        await lock.close();
        await rm(lockPath, { force: true });
      }
    }
  }
}
