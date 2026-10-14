import { describe, expect, it } from 'vitest';
import { deriveEventDependencyPlan } from '../../src/backtest/backtest-dependency-events.js';
import { knownCashRunFixture } from './known-cash-test-fixtures.js';

describe('显式已知方案的依赖边界', () => {
  it('只从新模式取消旧完整现金读取，原raw入口保持完整覆盖依赖', async () => {
    const { strategy, runConfig } = await knownCashRunFixture();
    const result = deriveEventDependencyPlan(strategy, runConfig, runConfig.startDate, undefined);
    expect(result.dependencies).toEqual([]);
    const old = { ...runConfig, knownCashPreparation: undefined };
    const legacy = deriveEventDependencyPlan(strategy, old, runConfig.startDate, undefined);
    expect(legacy.dependencies[0]).toMatchObject({
      purpose: 'raw-accounting',
      completeCoverageRequired: true,
    });
  });
  it('公司行动信号明确拒绝，原完整信号依赖不被删去', async () => {
    const { strategy, runConfig } = await knownCashRunFixture();
    strategy.entry = { type: 'corporateActionEvent', eventType: 'CASH_DIVIDEND' };
    const result = deriveEventDependencyPlan(strategy, runConfig, runConfig.startDate, undefined);
    expect(result.dependencies[0]).toMatchObject({
      purpose: 'strategy-signal',
      completeCoverageRequired: true,
      visibilityRequired: true,
    });
    expect(result.issues.some((x) => x.message.includes('不能使用公司行动'))).toBe(true);
  });
});
