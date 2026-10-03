import {
  indexDependencyArtifacts,
  parseCanonicalJson,
} from './backtest-snapshot-v3-dependency-artifact-checks.js';
import type { BacktestCorporateActionsResponse } from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import {
  dependencyEvidenceKey,
  expectedSnapshotDependencyRequestsV3,
  SnapshotDependencyV3Error,
  snapshotDependencyEvidenceRowV3,
  validateSnapshotCorporateActionPlanV3,
  validateSnapshotDependencyResponseV3,
  type SnapshotDependencyV3Artifact,
  type SnapshotDependencyV3Input,
  type SnapshotDependencyV3Result,
} from './backtest-snapshot-v3-dependencies.js';
import { canonicalizeManifest } from './backtest-snapshot.js';
import { validateSnapshotEventsV3 } from './backtest-snapshot-v3-events.js';

function fail(message: string): never {
  throw new SnapshotDependencyV3Error('artifact_mismatch', message);
}

const sameCanonicalValue = (left: unknown, right: unknown): boolean =>
  canonicalizeManifest(left) === canonicalizeManifest(right);

/**
 * Rechecks the required dependency set and response proof without network access.
 * Evidence stays under metadata so fact readers cannot mistake it for domain rows.
 */
export const validateSnapshotDependencyArtifactsV3 = (
  input: SnapshotDependencyV3Input,
  artifacts: readonly SnapshotDependencyV3Artifact[],
): SnapshotDependencyV3Result => {
  const requests = expectedSnapshotDependencyRequestsV3(input);
  const artifactsByKey = indexDependencyArtifacts(artifacts);
  const expectedKeys = new Set([...requests.map(({ key }) => key), dependencyEvidenceKey]);
  if (
    artifactsByKey.size !== expectedKeys.size ||
    [...artifactsByKey.keys()].some((key) => !expectedKeys.has(key))
  ) {
    fail('Snapshot V3 依赖 Artifact 集合与依赖计划不一致。');
  }

  const evidenceArtifact = artifactsByKey.get(dependencyEvidenceKey)!;
  if (evidenceArtifact.rows.length !== requests.length) {
    fail('Snapshot V3 依赖证明行数与依赖计划不一致。');
  }
  const evidenceByKey = new Map<string, ArtifactRow>();
  for (const row of evidenceArtifact.rows) {
    if (
      row.kind !== 'snapshot-dependency-evidence-v3' ||
      typeof row.artifactKey !== 'string' ||
      evidenceByKey.has(row.artifactKey)
    ) {
      fail('Snapshot V3 依赖证明行类型、key 或唯一性无效。');
    }
    evidenceByKey.set(row.artifactKey, row);
  }

  const providerRevisions: Record<string, string> = {};
  const corporateActionResponses: Record<string, BacktestCorporateActionsResponse> = {};
  for (const request of requests) {
    const artifact = artifactsByKey.get(request.key)!;
    const proof = evidenceByKey.get(request.key);
    if (!proof) fail(`Snapshot V3 缺少依赖证明: ${request.key}`);
    if (proof.purpose !== request.purpose || proof.identity !== request.identity) {
      fail(`Snapshot V3 依赖证明身份不匹配: ${request.key}`);
    }
    const serializedRequest = parseCanonicalJson(proof, 'request');
    if (!sameCanonicalValue(serializedRequest, request.request)) {
      fail(`Snapshot V3 依赖请求与规划范围不一致: ${request.key}`);
    }
    const serializedResponse = parseCanonicalJson(proof, 'response');
    if (request.purpose === 'corporateActions') {
      const event = validateSnapshotEventsV3(input, request, serializedResponse);
      if (
        !sameCanonicalValue(proof, event.evidence) ||
        !sameCanonicalValue(artifact.rows, event.rows)
      ) {
        fail(`Snapshot V3 事件事实行或原始响应证据不一致: ${request.key}`);
      }
      providerRevisions[request.key] = event.response.providerRevision;
      corporateActionResponses[request.identity] = event.response;
      continue;
    }
    const sourceResponse = request.purpose === 'instrumentFacts' && request.request.identityOnly
      ? parseCanonicalJson(proof, 'sourceResponse') : serializedResponse;
    const validated = validateSnapshotDependencyResponseV3(input, request, sourceResponse);
    const expectedProof = snapshotDependencyEvidenceRowV3(
      request,
      validated.response,
      validated.facts,
      validated.rows,
      sourceResponse,
    );
    if (proof.sourceResponse === undefined && !(request.purpose === 'instrumentFacts' && request.request.identityOnly)) {
      delete expectedProof.sourceResponse;
    }
    if (!sameCanonicalValue(proof, expectedProof)) {
      fail(`Snapshot V3 依赖响应证明或事实指纹不一致: ${request.key}`);
    }
    if (!sameCanonicalValue(artifact.rows, validated.rows)) {
      fail(`Snapshot V3 依赖事实行与响应 envelope 不一致: ${request.key}`);
    }
    providerRevisions[request.key] = validated.response.providerRevision;
  }
  if (evidenceByKey.size !== requests.length) {
    fail('Snapshot V3 存在未规划的依赖证明。');
  }
  validateSnapshotCorporateActionPlanV3(input, corporateActionResponses);
  return { artifacts, providerRevisions, corporateActionResponses };
};
