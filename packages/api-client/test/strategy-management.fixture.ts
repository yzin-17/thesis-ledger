export const id = '00000000-0000-4000-8000-000000000041';
export const other = '00000000-0000-4000-8000-000000000042';
export const at = '2026-10-24T00:00:00Z';
export const plan = {
  semanticVersion: 'strategy-monitoring-v1',
  strategyVersionId: id,
  strategyHash: 'strategy-hash',
  planHash: 'plan-hash',
  executionSymbol: '600000',
  evaluationTimeframe: '1d',
  rules: [],
  coverage: { riskTotal: 0, riskMapped: 0, items: [] },
};
export const experiment = {
  id,
  name: '本轮实验',
  nameSource: 'stored',
  baselineStrategyVersionId: other,
  status: 'running',
  stage: 'awaiting_finalization',
  objective: {},
  split: {},
  modelConfig: [],
  aiCallsUsed: 0,
  backtestRunsUsed: 0,
  inputTokensUsed: 0,
  outputTokensUsed: 0,
  costUsed: null,
  costSummary: {
    status: 'unavailable',
    currency: null,
    knownAmount: null,
    knownByCurrency: [],
    reason: 'unknown_cost',
  },
  tradingCost: {
    source: 'unavailable',
    commissionRate: null,
    slippageRate: null,
    isAssumption: true,
    zeroDoesNotMeanFree: true,
  },
  readEligibility: {
    state: 'restricted',
    code: 'TEST_NOT_REVEALED',
    scope: 'test',
    accessedAt: null,
    revealedAt: null,
  },
  createdAt: at,
  updatedAt: at,
};
export const risk = {
  id,
  strategyVersionId: id,
  accountId: other,
  symbol: '600000',
  revision: 2,
  planHash: plan.planHash,
  plan,
  cycleMode: 'existingAndFuture',
  enabled: false,
  notification: { enabled: false, cooldownMinutes: 60, severity: 'warning', channels: [] },
  coverage: plan.coverage,
  createdAt: at,
  updatedAt: at,
};
export const preview = {
  previewHash: 'preview-hash',
  plan,
  evaluations: [],
  cycleMode: risk.cycleMode,
  context: {},
};
