import { describe, expect, it } from 'vitest';
import { projectPriceResearchStrategy } from '@thesis-ledger/schemas';
import {
  compileRiskApplicationPlan,
  validatedRiskStrategy,
} from '../../src/strategy-optimization/strategy-risk-plan.js';
import { createStrategyFixture } from './strategy-optimization-postgres-fixtures.js';

const v2 = createStrategyFixture('600519.SH', '正式结构校验')('0.03');
v2.risk.push({ type: 'fixedTakeProfit', percent: '0.12' });
v2.risk.push({ type: 'maxHoldingPeriod', periods: 10 });
const v3 = projectPriceResearchStrategy(v2);

describe('正式策略风险计划结构校验', () => {
  it.each([v2, v3])('正式结构 V$schemaVersion 复用实际账户风险规则', (schema) => {
    const parsed = validatedRiskStrategy(schema, Number(schema.schemaVersion), 1);
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
    expect(() => validatedRiskStrategy(v3, 3, version)).toThrow('正式 V2 或 V3');
  });

  it.each([1, 4])('拒绝未知结构版本 %s', (schemaVersion) => {
    expect(() => validatedRiskStrategy(v3, schemaVersion, 1)).toThrow('正式 V2 或 V3');
  });

  it.each([[v2, 3], [v3, 2]] as const)('拒绝定义与持久化结构版本不匹配', (schema, schemaVersion) => {
    expect(() => validatedRiskStrategy(schema, schemaVersion, 1)).toThrow('定义与结构版本不一致');
  });

  it('仍拒绝含有绝对价格的非法风险规则', () => {
    const schema = { ...v3, risk: [{ type: 'fixedStop', percent: '0.03', price: '100' }] };
    expect(() => validatedRiskStrategy(schema, 3, 1)).toThrow('定义与结构版本不一致或无效');
  });
});
