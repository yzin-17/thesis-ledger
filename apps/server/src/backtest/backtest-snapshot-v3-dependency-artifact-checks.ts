import type { ArtifactRow } from './backtest-artifact-store.js';
import type { SnapshotDependencyV3Artifact } from './backtest-snapshot-v3-dependencies.js';
import { SnapshotDependencyV3Error } from './backtest-snapshot-v3-dependency-error.js';
import { canonicalizeManifest } from './backtest-snapshot.js';

function fail(message: string): never {
  throw new SnapshotDependencyV3Error('artifact_mismatch', message);
}

export const parseCanonicalJson = (row: ArtifactRow, field: string): unknown => {
  const encoded = row[field];
  if (typeof encoded !== 'string') {
    return fail(`Snapshot V3 依赖证明缺少 ${field}。`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded) as unknown;
  } catch {
    return fail(`Snapshot V3 依赖证明 ${field} 不是有效 JSON。`);
  }
  if (canonicalizeManifest(parsed) !== encoded) {
    return fail(`Snapshot V3 依赖证明 ${field} 不是 canonical JSON。`);
  }
  return parsed;
};

export const indexDependencyArtifacts = (
  artifacts: readonly SnapshotDependencyV3Artifact[],
): Map<string, SnapshotDependencyV3Artifact> => {
  const artifactsByKey = new Map<string, SnapshotDependencyV3Artifact>();
  for (const artifact of artifacts) {
    if (artifactsByKey.has(artifact.key)) {
      fail(`Snapshot V3 依赖 Artifact key 重复: ${artifact.key}`);
    }
    artifactsByKey.set(artifact.key, artifact);
  }
  return artifactsByKey;
};
