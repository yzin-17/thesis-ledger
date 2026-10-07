import { z } from 'zod';
import {
  backtestRunPreparationResultV3Schema,
  desiredProviderPolicyV3Schema,
  marketRouteKeyIdV3,
  type BacktestPreflightDiagnosticV3,
  type BacktestRunPreparationRequestV3,
  type MarketDataBarRouteKeyV3,
} from '@thesis-ledger/schemas';

const appliedPolicySchema = z.object({
  ...desiredProviderPolicyV3Schema.shape,
  syncState: z.literal('applied'),
  effectiveStale: z.literal(false),
});

export const preparationRouteContext = (policy: unknown, routeKey: MarketDataBarRouteKeyV3) => {
  const { contractVersion, consumer, requestId, revision, enabled, routes } =
    appliedPolicySchema.parse(policy);
  const desired = desiredProviderPolicyV3Schema.parse({
    contractVersion,
    consumer,
    requestId,
    revision,
    enabled,
    routes,
  });
  const route = desired.routes.find(
    (candidate) => marketRouteKeyIdV3(candidate.key) === marketRouteKeyIdV3(routeKey),
  );
  if (!desired.enabled || !route) throw new Error('当前执行路由未启用或未配置');
  return {
    desiredRevision: desired.revision,
    targetSources: route.targets.map((target, routeIndex) => ({ ...target, routeIndex })),
  };
};

export const preparationBlocked = (
  request: BacktestRunPreparationRequestV3,
  checkedAt: string,
  diagnostics: BacktestPreflightDiagnosticV3[],
) =>
  backtestRunPreparationResultV3Schema.parse({
    contractVersion: 3,
    requestId: request.requestId,
    checkedAt,
    scope: 'execution-window',
    status: 'blocked',
    diagnostics,
  });

export const preparationDiagnostic = (
  request: BacktestRunPreparationRequestV3,
  message: string,
  options: Partial<
    Pick<
      BacktestPreflightDiagnosticV3,
      | 'category'
      | 'code'
      | 'symbol'
      | 'routeKey'
      | 'targetSources'
      | 'missingFields'
      | 'incompatibleRules'
    >
  > = {},
): BacktestPreflightDiagnosticV3 => ({
  severity: 'error',
  category: 'data-unavailable',
  code: 'DATA_UNAVAILABLE',
  message,
  symbol: request.runConfig.executionModel.scope.symbol,
  capability: 'DAILY_BAR',
  purpose: 'execution',
  dateRange: { startDate: request.runConfig.startDate, endDate: request.runConfig.endDate },
  routeKey: null,
  missingFields: [],
  incompatibleRules: [],
  targetSources: [],
  suggestedActions: [
    { action: 'retry-preflight', description: '核对模型、日期、路由及数据证据后重新准备配置。' },
  ],
  ...options,
});
