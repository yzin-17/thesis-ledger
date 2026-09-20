import { describe, expect, it } from 'vitest';
import {
  findStrategyVersion,
  latestStrategyVersion,
  legacyStrategyDestination,
  strategyCenterFocusState,
  strategyCenterFocusTarget,
  strategyCenterPath,
  strategyCenterTabForPath,
} from '../src/features/strategy/strategy-center.navigation.js';
import { nextExperimentDay } from '../src/features/strategy/StrategyExperimentCreatePage.js';

const strategies = [
  {
    id: 'strategy/a',
    name: '明确版本策略',
    versions: [
      { id: 'version/1', version: 1, schemaVersion: 1 },
      { id: 'version/2', version: 2, schemaVersion: 2 },
    ],
  },
];

describe('策略中心导航与实验创建契约', () => {
  it('旧入口只迁移列表类型，不推测对象版本', () => {
    expect(legacyStrategyDestination('?tab=library')).toBe('/strategy/library');
    expect(legacyStrategyDestination('?tab=jobs')).toBe('/strategy/jobs');
    expect(legacyStrategyDestination('?tab=optimization')).toBe('/strategy/experiments');
    expect(legacyStrategyDestination('?tab=unknown')).toBe('/strategy/library');
  });

  it('详情路由映射到对应的受控顶层页签', () => {
    expect(strategyCenterTabForPath('/strategy/jobs/job-1')).toBe('jobs');
    expect(strategyCenterTabForPath('/strategy/experiments/experiment-1')).toBe('experiments');
    expect(strategyCenterTabForPath('/strategy/library/strategy-1/versions/version-1')).toBe(
      'library',
    );
  });

  it('详情地址编码稳定 ID，解析失败不回退最新版本', () => {
    expect(strategyCenterPath.strategyVersion('strategy/a', 'version/2')).toBe(
      '/strategy/library/strategy%2Fa/versions/version%2F2',
    );
    expect(strategyCenterPath.riskApplication('strategy/a', 'version/2')).toBe(
      '/strategy/library/strategy%2Fa/versions/version%2F2/risk-application',
    );
    expect(strategyCenterPath.job('job/a')).toBe('/strategy/jobs/job%2Fa');
    expect(findStrategyVersion(strategies, 'strategy/a', 'version/1')?.version.version).toBe(1);
    expect(findStrategyVersion(strategies, 'strategy/a', 'missing')).toBeNull();
    expect(latestStrategyVersion(strategies[0]?.versions ?? [])?.id).toBe('version/2');
  });

  it('三段区间从前一段结束日的次日连续开始', () => {
    expect(nextExperimentDay('2026-03-18')).toBe('2026-03-19');
    expect(nextExperimentDay('2026-12-31')).toBe('2027-01-01');
  });

  it('路由型 Drawer 只恢复显式登记的来源焦点', () => {
    const state = strategyCenterFocusState('strategy-version-edit-trigger');
    expect(strategyCenterFocusTarget(state)).toBe('strategy-version-edit-trigger');
    expect(strategyCenterFocusTarget(null)).toBeNull();
    expect(strategyCenterFocusTarget({ strategyCenterFocusTargetId: 1 })).toBeNull();
  });
});
