import type { ExecutionRuleSnapshot } from '@thesis-ledger/schemas';

type SupportedExecutionRuleSnapshot = Extract<ExecutionRuleSnapshot, { status: 'supported' }>;

export class BacktestMarketRulesUnavailableError extends Error {
  readonly code = 'MARKET_RULES_UNAVAILABLE';

  constructor(message: string) {
    super(message);
    this.name = 'BacktestMarketRulesUnavailableError';
  }
}

export const requireFrozenExecutionRules = (
  snapshot: ExecutionRuleSnapshot,
  expectedVersion: string,
  range: { start: string; end: string },
): SupportedExecutionRuleSnapshot => {
  if (snapshot.status === 'unavailable') {
    throw new BacktestMarketRulesUnavailableError(snapshot.reason);
  }
  if (snapshot.version !== expectedVersion) {
    throw new BacktestMarketRulesUnavailableError(
      `冻结市场规则版本不匹配: expected=${expectedVersion}, actual=${snapshot.version}`,
    );
  }
  if (snapshot.range.start > range.start || snapshot.range.end < range.end) {
    throw new BacktestMarketRulesUnavailableError(
      `冻结市场规则未覆盖运行区间: ${range.start}..${range.end}`,
    );
  }
  return snapshot;
};
