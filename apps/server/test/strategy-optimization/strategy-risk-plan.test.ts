import { describe, expect, it } from 'vitest';
import { projectPriceResearchStrategy } from '@thesis-ledger/schemas';
import {
  compileRiskApplicationPlan,
  validatedRiskStrategy,
} from '../../src/strategy-optimization/strategy-risk-plan.js';
import { createStrategyFixture } from './strategy-optimization-postgres-fixtures.js';

const executionBound = createStrategyFixture('600519.SH', '正式结构校验')('0.03');
executionBound.risk.push({ type: 'fixedTakeProfit', percent: '0.12' });
executionBound.risk.push({ type: 'maxHoldingPeriod', periods: 10 });
const researchBound = projectPriceResearchStrategy(executionBound);

describe('正式策略风险计划结构校验', () => {
  it.each([['执行价格', executionBound], ['研究价格', researchBound]] as const)('%s策略复用实际账户风险规则', (_label, schema) => {
    const parsed = validatedRiskStrategy(schema, 1, 1);
    const plan = compileRiskApplicationPlan(parsed, 'formal-version');
    expect(plan.rules).toEqual([
      expect.objectContaining({ metric: 'priceToAverageCostReturn', threshold: '-0.03' }),
      expect.objectContaining({ metric: 'priceToAverageCostReturn', threshold: '0.12' }),
      expect.objectContaining({ metric: 'holdingPeriods', threshold: '10' }),
    ]);
    expect(plan.coverage).toMatchObject({ riskTotal: 3, riskMapped: 3 });
    expect(plan.coverage.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'entry', status: 'not_risk' }),
      expect.objectContaining({ source: 'sizing', status: 'not_risk' }),
      expect.objectContaining({ source: 'exit', status: 'unsupported' }),
    ]));
  });

  it.each([0, -1])('不允许实验版本 %s 直接生成风险计划', (version) => {
    expect(() => validatedRiskStrategy(researchBound, 1, version)).toThrow('风险应用需要现行正式策略版本');
  });

  it.each([2, 3, 4])('拒绝已退役或未知的持久化版本 %s', (schemaVersion) => {
    expect(() => validatedRiskStrategy(researchBound, schemaVersion, 1)).toThrow('风险应用需要现行正式策略版本');
  });

  it.each(['2', '3'])('拒绝持久化记录中混入旧定义 %s', (schemaVersion) => {
    expect(() => validatedRiskStrategy({ ...researchBound, schemaVersion }, 1, 1)).toThrow('定义与结构版本不一致');
  });

  it('仍拒绝含有绝对价格的非法风险规则', () => {
    const schema = { ...researchBound, risk: [{ type: 'fixedStop', percent: '0.03', price: '100' }] };
    expect(() => validatedRiskStrategy(schema, 1, 1)).toThrow('定义与结构版本不一致或无效');
  });
});
