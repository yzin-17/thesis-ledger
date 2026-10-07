import { instrumentIdentity } from './backtest-snapshot-v3-dependency-instrument-identity.js';
import { tradabilityRequestSourceV3, type SnapshotTradabilityWindowV3 } from './backtest-snapshot-v3-tradability.js';
export { validateSnapshotDependencyResponseV3 } from './backtest-snapshot-v3-dependency-response-checks.js';
import {
  backtestInstrumentFactsRequestSchema,
  runConfigSchemaV3,
  strategySchema,
  type BacktestCalendarResponse,
  type BacktestCorporateActionsResponse,
  type BacktestInstrumentFactsResponse,
  type BacktestInstrumentType,
  type BacktestMarket,
  type RunConfigV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import type { SnapshotEventRevisionsV3 } from './backtest-snapshot-v3-events.js';
import type { ArtifactRow } from './backtest-artifact-store.js';
import {
  planBacktestDependencies,
  type BacktestDependencyPlan,
} from './backtest-dependency-plan.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import {
  calendarDependencyRequests,
  type SettlementCalendarPolicy,
} from './backtest-settlement-calendar.js';

export interface SnapshotDependencyV3Input {
  strategy: BacktestStrategy;
  runConfig: RunConfigV3;
  plan: BacktestDependencyPlan;
  eventRevisions?: SnapshotEventRevisionsV3;
  settlementCalendarPolicy?: SettlementCalendarPolicy | undefined;
  tradabilityWindow?: SnapshotTradabilityWindowV3 | undefined;
}

export interface SnapshotDependencyV3Artifact {
  key: string;
  rows: readonly ArtifactRow[];
}

export interface SnapshotDependencyV3Result {
  artifacts: readonly SnapshotDependencyV3Artifact[];
  /** Response revisions keyed by the dependency artifact's relative key. */
  providerRevisions: Readonly<Record<string, string>>;
  /** Full, schema-validated responses keyed by the planner's instrument identity. */
  corporateActionResponses: Readonly<Record<string, BacktestCorporateActionsResponse>>;
}

import {
  SnapshotDependencyV3Error,
  type SnapshotDependencyV3ErrorReason,
} from './backtest-snapshot-v3-dependency-error.js';
export {
  SnapshotDependencyV3Error,
  type SnapshotDependencyV3ErrorReason,
} from './backtest-snapshot-v3-dependency-error.js';

type CalendarRequest = {
  market: BacktestMarket;
  start: string;
  end: string;
  dataAsOf: string;
};
type CorporateActionsRequest = {
  symbol: string;
  market: BacktestMarket;
  instrumentType: BacktestInstrumentType;
  start: string;
  end: string;
  dataAsOf: string;
};
export type DependencyRequest =
  | {
      purpose: 'calendar';
      identity: string;
      key: string;
      range: { start: string; end: string };
      request: CalendarRequest;
    }
  | {
      purpose: 'instrumentFacts';
      identity: string;
      key: string;
      range: { start: string; end: string };
      request: ReturnType<typeof backtestInstrumentFactsRequestSchema.parse>;
    }
  | {
      purpose: 'corporateActions';
      identity: string;
      key: string;
      range: { start: string; end: string };
      dependencies: BacktestDependencyPlan['corporateActions']['dependencies'];
      request: CorporateActionsRequest;
    };

export const dependencyEvidenceKey = 'metadata/dependency-evidence-v3.parquet';
function fail(reason: SnapshotDependencyV3ErrorReason, message: string): never {
  throw new SnapshotDependencyV3Error(reason, message);
}

const sameCanonicalValue = (left: unknown, right: unknown): boolean =>
  canonicalizeManifest(left) === canonicalizeManifest(right);

const scopeProjection = (plan: BacktestDependencyPlan) => ({
  version: plan.version,
  runWindow: plan.runWindow,
  warmup: plan.warmup,
  calendarMarkets: plan.calendarMarkets,
  requiredFx: plan.requiredFx,
  dependencyDatasets: plan.datasets
    .filter((dataset) =>
      ['calendar', 'instrumentFacts', 'corporateActions', 'fx', 'nav'].includes(dataset.purpose),
    )
    .map((dataset) => ({
      instrument: dataset.instrument,
      purpose: dataset.purpose,
      requestedTimeframe: dataset.requestedTimeframe,
      baseTimeframe: dataset.baseTimeframe,
      range: dataset.range,
    }))
    .sort((left, right) => canonicalizeManifest(left).localeCompare(canonicalizeManifest(right))),
  corporateActionDependencies: plan.corporateActions.dependencies,
  corporateActionInstruments: plan.corporateActions.requiredInstruments,
});

const assertPlanMatchesInput = (input: SnapshotDependencyV3Input): void => {
  if (input.plan.version !== 'backtest-dependency-plan-v1') {
    fail('dependency_plan_mismatch', 'Snapshot V3 依赖计划版本无效。');
  }
  try {
    strategySchema.parse(input.strategy);
    runConfigSchemaV3.parse(input.runConfig);
  } catch {
    fail('request_scope_invalid', 'Snapshot V3 策略或 RunConfig 未通过严格 Schema 校验。');
  }
  const plannedFromInput = planBacktestDependencies({
    strategy: input.strategy,
    runConfig: input.runConfig,
  });
  if (!sameCanonicalValue(scopeProjection(plannedFromInput), scopeProjection(input.plan))) {
    fail('dependency_plan_mismatch', 'Snapshot V3 依赖计划与策略或 RunConfig 范围不一致。');
  }
};

const assertSupportedDependencies = (plan: BacktestDependencyPlan): void => {
  const unsupported = plan.datasets.find(
    (dataset) => dataset.purpose === 'fx' || dataset.purpose === 'nav',
  );
  if (unsupported || plan.requiredFx.length > 0) {
    const identity = unsupported?.instrument ?? plan.requiredFx[0];
    fail(
      'unsupported_dependency',
      `Snapshot V3 当前未实现 ${unsupported?.purpose ?? 'fx'} 依赖冻结: ${identity}`,
    );
  }
};

export const expectedSnapshotDependencyRequestsV3 = (
  input: SnapshotDependencyV3Input,
): DependencyRequest[] => {
  const { plan, runConfig } = input;
  assertPlanMatchesInput(input);
  assertSupportedDependencies(plan);

  const expectedRange = { start: plan.warmup.startDate, end: runConfig.endDate };
  const requests = calendarDependencyRequests(input, (message) =>
    fail('request_scope_invalid', message),
  );

  const factDatasets = plan.datasets.filter((dataset) => dataset.purpose === 'instrumentFacts');
  const factsByIdentity = new Map<string, typeof factDatasets>();
  for (const dataset of factDatasets) {
    const group = factsByIdentity.get(dataset.instrument) ?? [];
    group.push(dataset);
    factsByIdentity.set(dataset.instrument, group);
  }
  for (const identity of [...factsByIdentity.keys()].sort()) {
    const datasets = factsByIdentity.get(identity)!;
    if (
      datasets.some(
        (dataset) =>
          dataset.range.startDate !== expectedRange.start ||
          dataset.range.endDate !== expectedRange.end,
      )
    ) {
      fail('request_scope_invalid', `Snapshot V3 instrumentFacts 请求范围无效: ${identity}`);
    }
    const instrument = instrumentIdentity(identity);
    const window = input.tradabilityWindow;
    if (instrument.market === 'CN' && runConfig.priceInputBindings && !window) {
      fail('request_scope_invalid', '逐日可交易性请求缺少本次选中的行情来源');
    }
    if (window && instrument.market === 'CN' && window.symbol !== instrument.symbol) {
      fail('request_scope_invalid', '逐日可交易性请求不能复用其他标的来源');
    }
    const request = backtestInstrumentFactsRequestSchema.parse({
      symbol: instrument.symbol,
      market: instrument.market,
      instrumentType: instrument.instrumentType,
      start: expectedRange.start,
      end: expectedRange.end,
      executionStart: runConfig.startDate,
      executionEnd: runConfig.endDate,
      dataAsOf: runConfig.dataAsOf,
      ...(window && instrument.market === 'CN' ? tradabilityRequestSourceV3(window) : {}),
    });
    requests.push({
      purpose: 'instrumentFacts',
      identity,
      key: `instrumentFacts/${instrument.market}-${instrument.symbol}.parquet`,
      range: { ...expectedRange },
      request,
    });
  }

  const actionGroups = new Map<
    string,
    BacktestDependencyPlan['corporateActions']['dependencies'][number][]
  >();
  for (const dependency of plan.corporateActions.dependencies) {
    const group = actionGroups.get(dependency.instrument) ?? [];
    group.push(dependency);
    actionGroups.set(dependency.instrument, group);
  }
  for (const identity of [...actionGroups.keys()].sort()) {
    const dependencies = actionGroups.get(identity)!;
    const instrument = instrumentIdentity(identity);
    const start = dependencies
      .map((dependency) => dependency.effectiveDateWindow.startDate)
      .sort()[0]!;
    const end = dependencies
      .map((dependency) => dependency.effectiveDateWindow.endDate)
      .sort()
      .at(-1)!;
    const request = {
      symbol: instrument.symbol,
      market: instrument.market,
      instrumentType: instrument.instrumentType,
      start,
      end,
      dataAsOf: runConfig.dataAsOf,
    } satisfies CorporateActionsRequest;
    requests.push({
      purpose: 'corporateActions',
      identity,
      key: `corporateActions/${instrument.market}-${instrument.symbol}.parquet`,
      range: { start, end },
      dependencies,
      request,
    });
  }

  requests.sort((left, right) => left.key.localeCompare(right.key));
  if (new Set(requests.map((request) => request.key)).size !== requests.length) {
    fail('request_scope_invalid', 'Snapshot V3 依赖计划产生了重复 Artifact key。');
  }
  if (requests.length === 0) {
    fail('request_scope_invalid', 'Snapshot V3 依赖计划没有可冻结的 Calendar 或标的事实。');
  }
  return requests;
};

export const snapshotDependencyEvidenceRowV3 = (
  request: DependencyRequest,
  response:
    BacktestCalendarResponse | BacktestInstrumentFactsResponse | BacktestCorporateActionsResponse,
  facts: readonly object[],
  rows: readonly ArtifactRow[],
  sourceResponse?: unknown,
): ArtifactRow => ({
  kind: 'snapshot-dependency-evidence-v3',
  purpose: request.purpose,
  identity: request.identity,
  artifactKey: request.key,
  provider: response.provider,
  providerRevision: response.providerRevision,
  request: canonicalizeManifest(request.request),
  response: canonicalizeManifest(response),
  factFingerprints: canonicalizeManifest(facts.map((fact) => hashCanonicalManifest(fact))),
  rowsFingerprint: hashCanonicalManifest(rows),
  sourceResponse: request.purpose === 'instrumentFacts' && request.request.identityOnly
    ? canonicalizeManifest(sourceResponse) : null,
});

export const validateSnapshotCorporateActionPlanV3 = (
  input: SnapshotDependencyV3Input,
  responses: Readonly<Record<string, BacktestCorporateActionsResponse>>,
): void => {
  if (input.plan.corporateActions.dependencies.length === 0) return;
  const verifiedPlan = planBacktestDependencies({
    strategy: input.strategy,
    runConfig: input.runConfig,
    corporateActionResponses: responses,
  });
  if (verifiedPlan.corporateActions.validation !== 'complete') {
    const eventIssue = verifiedPlan.blockingIssues.find((issue) => issue.code.startsWith('EVENT_'));
    fail('event_plan_blocked', eventIssue?.message ?? 'Snapshot V3 公司行动事实未满足依赖计划。');
  }
};

export { collectSnapshotDependenciesV3 } from './backtest-snapshot-v3-dependency-collector.js';

export { validateSnapshotDependencyArtifactsV3 } from './backtest-snapshot-v3-dependency-validation.js';
