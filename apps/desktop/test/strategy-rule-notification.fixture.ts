import { compileStrategyMonitoringPlan } from '@thesis-ledger/domain';
import {
  createDefaultStrategySchema,
  setStrategyExecutionSymbol,
} from '../src/features/strategy/strategy.schema';
import type {
  StrategyRiskApplication,
  RiskApplicationPreview,
} from '../src/features/strategy/strategy-optimization.api';
import fixture from './fixtures/experiment-risk-ui-recovery.json';
import { precisionRiskRule } from './risk-threshold.fixture';

export const manualNotificationRule = {
  ...precisionRiskRule(),
  notification: { enabled: true, cooldownMinutes: 90, providers: ['备用通知'] },
};

const schema = setStrategyExecutionSymbol(
  createDefaultStrategySchema('逐条通知验收策略'),
  '600519.SH',
);
schema.signalSources = schema.signalSources.map((source: Record<string, unknown>) => ({
  ...source,
  asset: schema.executionInstrument,
}));
schema.risk = [
  { type: 'fixedStop', percent: '0.03' },
  { type: 'maxHoldingPeriod', periods: 10 },
];
export const ruleStrategy = {
  id: 'strategy',
  name: '逐条通知验收策略',
  versions: [
    { id: fixture.experiment.baselineStrategyVersionId, version: 1, schemaVersion: 1, schema },
  ],
};
export const rulePlan = compileStrategyMonitoringPlan(
  schema,
  'controlled-strategy',
  ruleStrategy.versions[0].id,
);
export const rulePreview: RiskApplicationPreview = {
  previewHash: 'controlled-preview',
  plan: rulePlan,
  cycleMode: 'existingAndFuture',
  context: { positionId: null },
  evaluations: rulePlan.rules.map((rule) => ({
    sourceKey: rule.sourceKey,
    state: 'unavailable',
    threshold: rule.threshold,
    reason: '缺少实际持仓数量',
  })),
};
export const ruleApplication: StrategyRiskApplication = {
  id: '77777777-7777-4777-8777-777777777777',
  strategyVersionId: ruleStrategy.versions[0].id,
  accountId: fixture.account.id,
  symbol: '600519.SH',
  revision: 1,
  planHash: rulePlan.planHash,
  plan: rulePlan,
  cycleMode: 'existingAndFuture',
  enabled: false,
  notification: {
    enabled: false,
    severity: 'warning',
    cooldownMinutes: 60,
    channels: [],
    ruleOverrides: { [rulePlan.rules[0]!.sourceKey]: { severity: 'error', cooldownMinutes: 0 } },
  },
  coverage: rulePlan.coverage,
  createdAt: '2026-11-12T00:00:00Z',
  updatedAt: '2026-11-12T00:00:00Z',
};
