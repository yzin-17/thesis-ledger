export type StrategyStackParams = {
  StrategyLibrary: undefined;
  StrategyVersion: { strategyId: string; versionId: string };
  StrategyEditor: { strategyId?: string; versionId?: string } | undefined;
  StrategyAuthoring: { draftId?: string; versionId?: string } | undefined;
  BacktestSetup: { strategyId: string; versionId: string; kind: 'ordinary' | 'nav' };
  BacktestJobs: { kind: 'ordinary' | 'nav' };
  BacktestResult: { kind: 'ordinary' | 'nav'; id: string };
  OptimizationSetup: { versionId?: string } | undefined;
  OptimizationResults: { id?: string } | undefined;
  OptimizationAdoption: { id: string; candidateId: string };
  StrategyRisk: { versionId?: string } | undefined;
  StrategyRiskCreate: { versionId?: string } | undefined;
  StrategyRiskEditor: { id: string };
};
