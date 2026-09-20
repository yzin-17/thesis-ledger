import type { StrategyRecord, StrategyVersion } from './strategy.types.js';

export type StrategyCenterTab = 'library' | 'jobs' | 'experiments';

export const strategyCenterPath = {
  library: '/strategy/library',
  jobs: '/strategy/jobs',
  job: (jobId: string) => `/strategy/jobs/${encodeURIComponent(jobId)}`,
  experiments: '/strategy/experiments',
  newStrategy: '/strategy/library/new',
  newExperiment: '/strategy/experiments/new',
  strategyVersion: (strategyId: string, versionId: string) =>
    `/strategy/library/${encodeURIComponent(strategyId)}/versions/${encodeURIComponent(versionId)}`,
  editStrategyVersion: (strategyId: string, versionId: string) =>
    `/strategy/library/${encodeURIComponent(strategyId)}/versions/${encodeURIComponent(versionId)}/edit`,
  riskApplication: (strategyId: string, versionId: string) =>
    `/strategy/library/${encodeURIComponent(strategyId)}/versions/${encodeURIComponent(versionId)}/risk-application`,
  experiment: (experimentId: string) => `/strategy/experiments/${encodeURIComponent(experimentId)}`,
} as const;

export const strategyCenterTabForPath = (pathname: string): StrategyCenterTab => {
  if (pathname.startsWith(strategyCenterPath.jobs)) return 'jobs';
  if (pathname.startsWith(strategyCenterPath.experiments)) return 'experiments';
  return 'library';
};

export const strategyCenterTriggerId = {
  editVersion: 'strategy-version-edit-trigger',
  riskApplication: 'strategy-risk-application-trigger',
} as const;

const focusTargetStateKey = 'strategyCenterFocusTargetId';

export const strategyCenterFocusState = (targetId: string) => ({
  [focusTargetStateKey]: targetId,
});

export const strategyCenterFocusTarget = (state: unknown) => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const value = (state as Record<string, unknown>)[focusTargetStateKey];
  return typeof value === 'string' ? value : null;
};

export const latestStrategyVersion = (versions: StrategyVersion[]) =>
  [...versions].sort((left, right) => right.version - left.version)[0] ?? null;

export const findStrategyVersion = (
  strategies: StrategyRecord[],
  strategyId: string | undefined,
  versionId: string | undefined,
) => {
  if (!strategyId || !versionId) return null;
  const strategy = strategies.find((candidate) => candidate.id === strategyId);
  if (!strategy) return null;
  const version = strategy.versions.find((candidate) => candidate.id === versionId);
  return version ? { strategy, version } : null;
};

export const legacyStrategyDestination = (search: string) => {
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'jobs') return strategyCenterPath.jobs;
  if (tab === 'optimization') return strategyCenterPath.experiments;
  return strategyCenterPath.library;
};
