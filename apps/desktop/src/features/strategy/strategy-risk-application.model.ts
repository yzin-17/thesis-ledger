import type { StrategyRiskApplication } from './strategy-optimization.api.js';

export type RiskCycleMode = 'existingAndFuture' | 'nextPositionCycle';

export const riskApplicationFingerprint = (input: {
  strategyVersionId: string;
  accountId: string;
  symbol: string;
  cycleMode: RiskCycleMode;
}) => JSON.stringify(input);

export const matchingRiskApplications = (
  applications: StrategyRiskApplication[],
  input: {
    strategyVersionId: string;
    accountId: string;
    symbol: string;
    cycleMode: RiskCycleMode;
  },
) =>
  applications.filter(
    (application) =>
      application.strategyVersionId === input.strategyVersionId &&
      application.accountId === input.accountId &&
      application.symbol === input.symbol &&
      application.cycleMode === input.cycleMode &&
      !application.archivedAt,
  );

export const enabledRiskConflict = (
  applications: StrategyRiskApplication[],
  input: { accountId: string; symbol: string; matchingIds: ReadonlySet<string> },
) =>
  applications.find(
    (application) =>
      application.accountId === input.accountId &&
      application.symbol === input.symbol &&
      application.enabled &&
      !application.archivedAt &&
      !input.matchingIds.has(application.id),
  ) ?? null;

export const parseCooldownMinutes = (value: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_080) return null;
  return parsed;
};

export const riskCenterApplicationPath = (applicationId: string) =>
  `/risk-center?tab=strategy-applications&applicationId=${encodeURIComponent(applicationId)}`;
