import {
  backtestPreflightDiagnosticV3Schema,
  type BacktestCorporateActionsResponse,
  type BacktestPreflightDiagnosticV3,
} from '@thesis-ledger/schemas';
import {
  expectedSnapshotDependencyRequestsV3,
  SnapshotDependencyV3Error,
  validateSnapshotCorporateActionPlanV3,
  type DependencyRequest,
  type SnapshotDependencyV3Input,
} from './backtest-snapshot-v3-dependencies.js';
import {
  readSnapshotDependencyV3,
  type DependencyDsa,
} from './backtest-snapshot-v3-dependency-collector.js';
import { SnapshotEventObservationError } from './backtest-snapshot-v3-events.js';
import { preflightEventDiagnosticsV3 } from './backtest-preflight-v3-events.js';

function diagnostic(error: unknown, request?: DependencyRequest): BacktestPreflightDiagnosticV3 {
  const reason = error instanceof SnapshotDependencyV3Error ? error.reason : 'read_failed';
  const future = reason === 'future_fact';
  const scope = request?.purpose ?? 'dependencyPlan';
  let symbol: string | null = null;
  let capability: string | null = null;
  if (request?.purpose === 'calendar') capability = 'CALENDAR';
  if (request?.purpose === 'instrumentFacts') capability = 'INSTRUMENT_FACTS';
  if (request && request.purpose !== 'calendar') symbol = request.request.symbol;
  return backtestPreflightDiagnosticV3Schema.parse({
    severity: 'error',
    category: future ? 'point-in-time-unavailable' : 'data-unavailable',
    code: future ? 'FUTURE_DATA' : 'DATA_UNAVAILABLE',
    message: future ? '依赖事实晚于冻结时点，无法用于本次运行。' : '运行所需依赖未通过读取或完整性验证。',
    symbol,
    capability,
    purpose: request?.purpose ?? null,
    dateRange: request ? { startDate: request.range.start, endDate: request.range.end } : null,
    routeKey: null,
    missingFields: [`${scope}.${reason}`],
    incompatibleRules: [],
    targetSources: [],
    suggestedActions: [{
      action: future ? 'provide-point-in-time-evidence' : 'retry-preflight',
      description: future ? '补充冻结时点前已可用的事实后重新预检。' : '按所列依赖范围修复数据或来源后重新预检。',
    }],
  });
}

/** 仅验证非价格依赖；空诊断不代表行情、路由修订或整个运行已经就绪。 */
export async function preflightBacktestDependenciesV3(
  input: SnapshotDependencyV3Input,
  dsa: DependencyDsa,
): Promise<readonly BacktestPreflightDiagnosticV3[]> {
  let requests: DependencyRequest[];
  try {
    requests = expectedSnapshotDependencyRequestsV3(input);
  } catch (error) {
    return [diagnostic(error)];
  }
  const results = await Promise.all(requests.map(async (request) => {
    try {
      const read = await readSnapshotDependencyV3(input, request, dsa);
      return { request, read, diagnostics: [] };
    } catch (error) {
      const eventDiagnostics = error instanceof SnapshotEventObservationError
        ? preflightEventDiagnosticsV3(error.observations) : [];
      return { request, read: null,
        diagnostics: eventDiagnostics.length ? eventDiagnostics : [diagnostic(error, request)] };
    }
  }));
  const diagnostics: BacktestPreflightDiagnosticV3[] = [];
  const actions: Record<string, BacktestCorporateActionsResponse> = {};
  let actionFailed = false;
  for (const result of results) {
    diagnostics.push(...result.diagnostics);
    if (result.request.purpose !== 'corporateActions') continue;
    if (!result.read) actionFailed = true;
    else actions[result.request.identity] = result.read.response as BacktestCorporateActionsResponse;
  }
  if (!actionFailed) {
    try {
      validateSnapshotCorporateActionPlanV3(input, actions);
    } catch (error) {
      diagnostics.push(diagnostic(error));
    }
  }
  return diagnostics;
}
