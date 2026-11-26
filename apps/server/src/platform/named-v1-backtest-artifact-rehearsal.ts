import { copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import { backtestSnapshotManifestV3Schema } from '@thesis-ledger/schemas';
import { isCurrentRunForRead } from '../backtest/backtest-current-run-read.js';
import type { ArtifactRef, ArtifactRow } from '../backtest/backtest-artifact-store.js';
import { LocalSnapshotStore, canonicalizeManifest, hashCanonicalManifest } from '../backtest/backtest-snapshot.js';
import { convertObservation, convertPriceAcquisition } from './named-v1-market-window-conversion.js';
import { convertStrategyDefinition } from './named-v1-strategy-conversion.js';
import type { BacktestMigrationRow } from './named-v1-backtest-conversion.js';

type ArtifactCandidate = {
  original: BacktestMigrationRow;
  converted: BacktestMigrationRow;
  strategy: { schemaVersion: number; definition: unknown };
  sourceRoot: string;
  stagingRoot: string;
  referenceWindow?: PriceAcquisition | undefined;
};

export type PriceAcquisition = {
  identityFingerprint: string;
  responseHash: string;
  response: unknown;
};

function convertTradabilityColumns(row: ArtifactRow): ArtifactRow {
  const converted = { ...row };
  if (typeof row.historicalTradability === 'string')
    converted.historicalTradability = canonicalizeManifest(convertObservation(JSON.parse(row.historicalTradability)));
  if (typeof row.historicalTradabilityWindows === 'string')
    converted.historicalTradabilityWindows = canonicalizeManifest(
      (JSON.parse(row.historicalTradabilityWindows) as Record<string, unknown>[]).map(convertObservation),
    );
  return converted;
}

function convertWindowMetadata(row: ArtifactRow): ArtifactRow {
  if (typeof row.request !== 'string') throw new Error('冻结窗口缺少原请求');
  const request = JSON.parse(row.request) as Record<string, unknown>;
  const { contractVersion, dailyObservationVersion, ...originalRequest } = request;
  if (contractVersion !== 3 || ![undefined, 1, 2].includes(dailyObservationVersion as 1 | 2 | undefined))
    throw new Error('冻结窗口原请求合同无法识别');
  return convertTradabilityColumns({ ...row, request: canonicalizeManifest({
    ...originalRequest, contractVersion: 1,
    ...(dailyObservationVersion === 2 ? { dailyObservationContract: 'market-daily-tradability-window-v1' } : {}),
  }) });
}

function convertControlProjection(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as Record<string, unknown>;
  return envelope.contractVersion === 3 ? { ...envelope, contractVersion: 1 } : value;
}

function convertControlMetadata(row: ArtifactRow, priorConfig: unknown, nextConfig: unknown): ArtifactRow {
  if (typeof row.payload !== 'string') throw new Error('冻结控制投影缺少原始资料');
  const payload = JSON.parse(row.payload) as Record<string, unknown>;
  if (Object.hasOwn(payload, 'runConfigChecksum')) {
    if (payload.runConfigChecksum !== hashCanonicalManifest(priorConfig))
      throw new Error('冻结控制投影与原运行配置摘要不一致');
    payload.runConfigChecksum = hashCanonicalManifest(nextConfig);
  }
  const disclosure = payload.disclosure as Record<string, unknown> | undefined;
  if (disclosure?.status === 'source')
    disclosure.response = convertControlProjection(disclosure.response);
  const composition = payload.composition as {
    policy: unknown;
    entries: { query: unknown; request?: unknown; result?: unknown }[];
  } | undefined;
  if (composition) {
    composition.policy = convertControlProjection(composition.policy);
    for (const entry of composition.entries) {
      entry.query = convertControlProjection(entry.query);
      if (entry.request) entry.request = convertControlProjection(entry.request);
      if (entry.result) entry.result = convertControlProjection(entry.result);
    }
  }
  return { ...row, payload: canonicalizeManifest(payload) };
}

type RowFingerprint = { prior: string; current: string };
function convertDependencyMetadata(
  row: ArtifactRow,
  fingerprints: Map<string, RowFingerprint>,
  revisions: Map<string, RowFingerprint>,
): ArtifactRow {
  if (typeof row.response !== 'string' || typeof row.request !== 'string' ||
      !['calendar', 'instrumentFacts', 'corporateActions'].includes(String(row.purpose)))
    throw new Error('冻结依赖缺少可核验的请求与响应');
  const response = JSON.parse(row.response) as Record<string, unknown>;
  const convertResponse = (value: Record<string, unknown>) => {
    const result: Record<string, unknown> = {
      ...value,
      ...(value.version === 3 ? { version: 1 } : {}),
      ...(value.contractVersion === 3 ? { contractVersion: 1 } : {}),
    };
    if (value.historicalTradability && typeof value.historicalTradability === 'object')
      result.historicalTradability = convertObservation(value.historicalTradability as Record<string, unknown>);
    if (Array.isArray(value.historicalTradabilityWindows))
      result.historicalTradabilityWindows = value.historicalTradabilityWindows.map(convertObservation);
    if (Array.isArray(value.exchanges))
      result.exchanges = value.exchanges.map((exchange) => ({
        ...exchange, request: convertControlProjection(exchange.request), response: convertControlProjection(exchange.response),
      }));
    return result;
  };
  const binding = fingerprints.get(String(row.artifactKey));
  if (binding && row.rowsFingerprint !== binding.prior)
    throw new Error('标的事实行未匹配保存的原始摘要');
  const converted = convertResponse(response);
  if (row.purpose === 'corporateActions') {
    const prior = hashCanonicalManifest(response);
    if (row.providerRevision !== prior)
      throw new Error('事件冻结证明未匹配保存的原始摘要');
    revisions.set(String(row.artifactKey), { prior, current: hashCanonicalManifest(converted) });
  }
  return {
    ...row,
    ...(binding ? { rowsFingerprint: binding.current } : {}),
    ...(row.purpose === 'corporateActions' ? { providerRevision: hashCanonicalManifest(converted) } : {}),
    request: canonicalizeManifest(convertControlProjection(JSON.parse(row.request))),
    response: canonicalizeManifest(converted),
    ...(typeof row.sourceResponse === 'string' ? {
      sourceResponse: canonicalizeManifest(convertResponse(JSON.parse(row.sourceResponse))),
    } : {}),
  };
}

/** 在已复制的制品上重新封装元数据，复用现有冻结回读校验。 */
export async function rehearseBacktestArtifactConversion(candidate: ArtifactCandidate) {
  const { original, strategy } = candidate;
  const converted = structuredClone(candidate.converted);
  const sourceRoot = await realpath(candidate.sourceRoot);
  const stagingRoot = await realpath(candidate.stagingRoot);
  const originalInput = original.input as Record<string, unknown>;
  if (sourceRoot === stagingRoot || stagingRoot.startsWith(sourceRoot + '/') ||
      !/^[a-f0-9-]{36}$/.test(original.id) || originalInput.snapshotStorageAttempt !== undefined)
    return { outcome: 'unproven' as const, reason: '需要独立目录或尝试制品目录核验' };

  const priorFile = resolve(sourceRoot, 'snapshots', original.id, 'finalized.json');
  const rawManifest = JSON.parse(await readFile(priorFile, 'utf8')) as unknown;
  if (canonicalizeManifest(rawManifest) !== canonicalizeManifest(original.snapshotManifest))
    return { outcome: 'unproven' as const, reason: '物理清单与数据库原始清单不一致' };
  const manifest = backtestSnapshotManifestV3Schema.parse(converted.snapshotManifest);
  const runConfig = converted.runConfig as {
    priceResearch?: { actualPriceWindow?: { identityFingerprint: string; responseHash: string } };
  };
  const acquisition = candidate.referenceWindow;
  const previousReference = structuredClone(runConfig.priceResearch?.actualPriceWindow);
  if (runConfig.priceResearch?.actualPriceWindow && previousReference) {
    if (!acquisition || acquisition.identityFingerprint !== previousReference.identityFingerprint ||
        acquisition.responseHash !== previousReference.responseHash)
      return { outcome: 'unproven' as const, reason: '原价参考父窗口需要对应的实体及摘要' };
    runConfig.priceResearch.actualPriceWindow.responseHash =
      convertPriceAcquisition(acquisition.response, acquisition.responseHash).responseHash;
  }
  const nextStrategy = convertStrategyDefinition(strategy.schemaVersion, strategy.definition);
  if (!('definition' in nextStrategy))
    return { outcome: 'unproven' as const, reason: '制品依赖的策略定义无法转换' };

  const sourceStore = new LocalSnapshotStore(sourceRoot);
  const source = sourceStore.artifacts;
  const target = new LocalSnapshotStore(stagingRoot);
  const originalFingerprint = await sourceStore.v3.comparableDataFingerprint(manifest, manifest.artifacts);
  if (originalFingerprint !== manifest.comparableDataFingerprint)
    return { outcome: 'unproven' as const, reason: '原可比较数据摘要无法核验' };
  const metadataKey = `${original.id}/metadata/snapshot-metadata-v3.parquet`;
  const windowKey = `${original.id}/metadata/market-window-evidence-v3.parquet`;
  const actualPriceKey = `${original.id}/metadata/actual-price-evidence-v1.parquet`;
  const dependencyKey = `${original.id}/metadata/dependency-evidence-v3.parquet`;
  const cashKey = `${original.id}/metadata/known-cash-preparation-v1.parquet`;
  const controlKeys = new Set(['public-fees-v3', 'trading-status-v3', 'status-composition-v1'].map(
    (name) => `${original.id}/metadata/${name}.parquet`,
  ));
  const refs: ArtifactRef[] = [];
  const fingerprints = new Map<string, RowFingerprint>();
  const revisions = new Map<string, RowFingerprint>();
  const artifacts = [...manifest.artifacts].sort(
    (a, b) => Number(a.key === dependencyKey) - Number(b.key === dependencyKey),
  );
  for (const artifact of artifacts) {
    if (!artifact.key.startsWith(original.id + '/') ||
        artifact.key.split('/').some((part) => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part)))
      return { outcome: 'unproven' as const, reason: '冻结制品路径无法绑定原任务' };
    await source.inspect(artifact);
    if (artifact.key.startsWith(`${original.id}/instrumentFacts/`)) {
      const originalRows: ArtifactRow[] = [];
      for await (const row of await source.openRead(artifact)) originalRows.push(row);
      const rows = originalRows.map(convertTradabilityColumns);
      const prior = hashCanonicalManifest(originalRows);
      const current = hashCanonicalManifest(rows);
      if (prior !== current) {
        fingerprints.set(artifact.key.slice(original.id.length + 1), { prior, current });
        refs.push(await target.artifacts.put({ key: artifact.key, artifactId: artifact.artifactId, rows }));
        continue;
      }
    }
    if (artifact.key === metadataKey) {
      const rows = [];
      for await (const row of await source.openRead(artifact)) rows.push(row);
      const meta = rows[0];
      if (rows.length !== 1 || !meta || typeof meta.strategy !== 'string' ||
          typeof meta.runConfig !== 'string' ||
          hashCanonicalManifest(JSON.parse(meta.strategy)) !== hashCanonicalManifest(strategy.definition) ||
          hashCanonicalManifest(JSON.parse(meta.runConfig)) !== hashCanonicalManifest(original.runConfig))
        return { outcome: 'unproven' as const, reason: '物理元数据与原策略或原运行配置不一致' };
      refs.push(await target.artifacts.put({ key: artifact.key, artifactId: artifact.artifactId,
        rows: [{ ...meta, strategy: JSON.stringify(nextStrategy.definition),
          runConfig: JSON.stringify(converted.runConfig) }] }));
      continue;
    }
    if (artifact.key === windowKey || artifact.key === actualPriceKey) {
      const rows = [];
      for await (const row of await source.openRead(artifact)) {
        const metadata = convertWindowMetadata(row);
        if (artifact.key === actualPriceKey) {
          if (!previousReference || typeof row.frozenWindowRef !== 'string' || typeof row.completeResponse !== 'string')
            return { outcome: 'unproven' as const, reason: '原价参考制品缺少源窗口或完整响应' };
          const child = JSON.parse(row.frozenWindowRef) as typeof previousReference;
          const prior = typeof row.sourceFrozenWindowRef === 'string' ? JSON.parse(row.sourceFrozenWindowRef) : child;
          if (prior.identityFingerprint !== previousReference.identityFingerprint ||
              prior.responseHash !== previousReference.responseHash)
            return { outcome: 'unproven' as const, reason: '原价参考裁剪与父窗口绑定不一致' };
          const next = convertPriceAcquisition(JSON.parse(row.completeResponse), child.responseHash);
          metadata.completeResponse = canonicalizeManifest(next.response);
          metadata.frozenWindowRef = canonicalizeManifest({ ...child, responseHash: next.responseHash });
          if (typeof row.sourceFrozenWindowRef === 'string')
            metadata.sourceFrozenWindowRef = canonicalizeManifest(runConfig.priceResearch?.actualPriceWindow);
        }
        rows.push(metadata);
      }
      refs.push(await target.artifacts.put({ key: artifact.key, artifactId: artifact.artifactId, rows }));
      continue;
    }
    if (artifact.key === cashKey) {
      const before = (original.runConfig as Record<string, unknown>).knownCashPreparation;
      const after = (converted.runConfig as Record<string, unknown>).knownCashPreparation;
      const rows = [];
      for await (const row of await source.openRead(artifact)) {
        if (!after || typeof row.preparation !== 'string' || typeof row.control !== 'string' ||
            hashCanonicalManifest(JSON.parse(row.preparation)) !== hashCanonicalManifest(before))
          return { outcome: 'unproven' as const, reason: '现金制品和原运行准备不一致' };
        rows.push({ ...row, preparation: canonicalizeManifest(after),
          control: canonicalizeManifest(convertControlProjection(JSON.parse(row.control))) });
      }
      refs.push(await target.artifacts.put({ key: artifact.key, artifactId: artifact.artifactId, rows }));
      continue;
    }
    if (controlKeys.has(artifact.key) || artifact.key === dependencyKey) {
      const rows = [];
      for await (const row of await source.openRead(artifact))
        rows.push(artifact.key === dependencyKey ? convertDependencyMetadata(row, fingerprints, revisions) :
          convertControlMetadata(row, original.runConfig, converted.runConfig));
      refs.push(await target.artifacts.put({ key: artifact.key, artifactId: artifact.artifactId, rows }));
      continue;
    }
    const file = resolve(stagingRoot, 'artifacts', artifact.key);
    await mkdir(dirname(file), { recursive: true });
    await copyFile(resolve(sourceRoot, 'artifacts', artifact.key), file, constants.COPYFILE_EXCL);
    refs.push(artifact);
  }
  const comparableDataFingerprint = await target.v3.comparableDataFingerprint(manifest, refs);
  const providerRevisions = { ...manifest.providerRevisions };
  for (const [key, revision] of revisions) {
    if (providerRevisions[key] !== revision.prior)
      return { outcome: 'unproven' as const, reason: '原事件摘要与冻结清单不一致' };
    providerRevisions[key] = revision.current;
  }
  const nextManifest = { ...manifest, comparableDataFingerprint, providerRevisions,
    runConfigChecksum: hashCanonicalManifest(converted.runConfig),
    artifacts: refs.sort((a, b) => a.key.localeCompare(b.key)) };
  const snapshotId = hashCanonicalManifest(nextManifest);
  nextManifest.contentHash = snapshotId;
  const path = resolve(stagingRoot, 'snapshots', original.id, 'finalized.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, canonicalizeManifest(nextManifest) + '\n', { flag: 'wx' });
  await target.v3.replay(original.id);
  const { resultChecksum: _priorChecksum, ...resultBody } = converted.result as Record<string, unknown>;
  const resultPayload = { ...resultBody, snapshotId, contentHash: snapshotId, comparableDataFingerprint };
  const resultChecksum = deterministicResultChecksum(resultPayload);
  const row = { ...converted, snapshotId, snapshotManifest: nextManifest,
    input: { ...converted.input as Record<string, unknown>, snapshotId, runConfig: converted.runConfig },
    result: { ...resultPayload, resultChecksum }, resultChecksum };
  return isCurrentRunForRead(row) ? { outcome: 'rehearsed' as const, row } :
    { outcome: 'unproven' as const, reason: '制品封装后的作业与结果身份不能对账' };
}
