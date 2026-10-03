import type { BacktestCorporateActionsResponse } from '@thesis-ledger/schemas';
import type { DsaClient } from '../integration/dsa/dsa.client.js';
import type { ArtifactRow } from './backtest-artifact-store.js';
import {
  dependencyEvidenceKey,
  expectedSnapshotDependencyRequestsV3,
  SnapshotDependencyV3Error,
  snapshotDependencyEvidenceRowV3,
  validateSnapshotCorporateActionPlanV3,
  validateSnapshotDependencyResponseV3,
  type SnapshotDependencyV3Input,
  type SnapshotDependencyV3Artifact,
  type SnapshotDependencyV3Result,
  type DependencyRequest,
} from './backtest-snapshot-v3-dependencies.js';
import { collectSnapshotEventsV3 } from './backtest-snapshot-v3-events.js';

export type DependencyDsa = Pick<DsaClient, 'backtestCalendar' | 'backtestInstrumentFacts'> &
  Partial<Pick<DsaClient, 'effectiveControlPolicyV3' | 'marketRouteCatalogV3' | 'marketEventsV3'>>;

/** 预检与冻结共用单项读取和验证，不写入任何快照产物。 */
export async function readSnapshotDependencyV3(
  input: SnapshotDependencyV3Input,
  request: DependencyRequest,
  dsa: DependencyDsa,
) {
  if (request.purpose === 'corporateActions') {
    if (!dsa.effectiveControlPolicyV3 || !dsa.marketRouteCatalogV3 || !dsa.marketEventsV3) {
      throw new SnapshotDependencyV3Error('event_plan_blocked', 'Snapshot V3 缺少事件能力读取器。');
    }
    const result = await collectSnapshotEventsV3(input, request, {
      effectiveControlPolicyV3: () => dsa.effectiveControlPolicyV3!(),
      marketRouteCatalogV3: () => dsa.marketRouteCatalogV3!(),
      marketEventsV3: (scope) => dsa.marketEventsV3!(scope),
    });
    return { request, ...result };
  }
  const response =
    request.purpose === 'calendar'
      ? await dsa.backtestCalendar(request.request)
      : await dsa.backtestInstrumentFacts(request.request);
  const validated = validateSnapshotDependencyResponseV3(input, request, response);
  return {
    request,
    ...validated,
    evidence: snapshotDependencyEvidenceRowV3(
      request,
      validated.response,
      validated.facts,
      validated.rows,
      response,
    ),
  };
}

/** 仅收集规划依赖；事件通过独立 V3 能力读取。 */
export async function collectSnapshotDependenciesV3(
  input: SnapshotDependencyV3Input,
  dsa: DependencyDsa,
): Promise<SnapshotDependencyV3Result> {
  const requests = expectedSnapshotDependencyRequestsV3(input);
  const fetched = await Promise.all(
    requests.map((request) => readSnapshotDependencyV3(input, request, dsa)),
  );
  const artifacts: SnapshotDependencyV3Artifact[] = [];
  const evidenceRows: ArtifactRow[] = [];
  const providerRevisions: Record<string, string> = {};
  const corporateActionResponses: Record<string, BacktestCorporateActionsResponse> = {};
  for (const { request, response, rows, evidence } of fetched) {
    artifacts.push({ key: request.key, rows });
    evidenceRows.push(evidence);
    providerRevisions[request.key] = response.providerRevision;
    if (request.purpose === 'corporateActions') {
      corporateActionResponses[request.identity] = response as BacktestCorporateActionsResponse;
    }
  }
  artifacts.push({ key: dependencyEvidenceKey, rows: evidenceRows });
  validateSnapshotCorporateActionPlanV3(input, corporateActionResponses);
  return { artifacts, providerRevisions, corporateActionResponses };
}
