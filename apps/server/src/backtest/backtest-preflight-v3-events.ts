import { backtestPreflightDiagnosticV3Schema } from '@thesis-ledger/schemas';
import type { BacktestEventObservationsV3 } from './backtest-event-observations-v3.js';

/** 只披露实际固定请求的目标；控制面失败时不能借用执行行情来源。 */
export function preflightEventDiagnosticsV3(observations: BacktestEventObservationsV3['observations']) {
  return observations.flatMap(({ scope, result }) => {
    if (result.status === 'observed' && result.response.coverage.complete) return [];
    const incomplete = result.status === 'observed';
    const reason = result.status === 'unavailable' ? result.reason : 'coverage_incomplete';
    const request = result.request;
    return [backtestPreflightDiagnosticV3Schema.parse({
      severity: 'error', category: incomplete ? 'insufficient-coverage' : 'data-unavailable',
      code: 'DATA_UNAVAILABLE',
      message: incomplete ? '所需事件能力未证明完整覆盖请求范围。' : '所需事件能力读取不可用。',
      symbol: scope.symbol, capability: scope.routeKey.capability, purpose: 'corporateActions',
      dateRange: { startDate: scope.start, endDate: scope.end }, routeKey: scope.routeKey,
      missingFields: [`corporateActions.${scope.routeKey.capability}.${reason}`],
      incompatibleRules: [], targetSources: request ? [request.routeTarget] : [],
      suggestedActions: [{ action: incomplete ? 'repair-data-coverage' : 'retry-preflight',
        description: incomplete ? '补充该事件能力的完整覆盖证据后重新预检。' : '检查所列事件路由和来源状态后重新预检。' }],
    })];
  });
}
