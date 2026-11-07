import { describe, expect, it } from 'vitest';
import {
  evaluateV01Rule,
  formatRiskEventName,
  formatRiskRuleThreshold,
  type RiskRule,
} from '../src/index.js';

const rule: RiskRule = {
  id: 'scientific-rule',
  version: 1,
  kind: 'cost-stop',
  scope: 'security',
  severity: 'warning',
  threshold: 0.1,
  enabled: true,
};
const context = { symbol: 'TEST.US', marketTime: '2026-11-07T00:00:00Z' };

describe('风险执行的有限数值边界', () => {
  it.each([
    ['cost-stop', 1e-9, 0.9, 1],
    ['take-profit', 1e-9, 1.1, 1],
    ['cost-stop', Number.MIN_VALUE, 0.9, 1],
    ['take-profit', Number.MIN_VALUE, 1.1, 1],
    ['cost-stop', 0.1, 8e-8, 1e-7],
    ['take-profit', 0.1, 1.2e-7, 1e-7],
  ] as const)('%s 接受科学计数的阈值或价格 %s/%s/%s', (kind, threshold, price, costPrice) => {
    expect(
      evaluateV01Rule({ ...rule, kind, threshold }, { ...context, price, costPrice })?.triggered,
    ).toBe(true);
  });

  it.each([
    ['cost-stop', 45, 'lte'],
    ['take-profit', 55, 'gte'],
    ['cost-stop', 9e24, 'lte'],
    ['take-profit', 1.1e25, 'gte'],
  ] as const)('%s 在相等边界保留严格与包含比较', (kind, price, comparisonOperator) => {
    const costPrice = price > 100 ? 1e25 : 50;
    expect(evaluateV01Rule({ ...rule, kind }, { ...context, price, costPrice })?.triggered).toBe(
      false,
    );
    expect(
      evaluateV01Rule(
        { ...rule, kind, parameters: { comparisonOperator } },
        { ...context, price, costPrice },
      )?.triggered,
    ).toBe(true);
  });

  it('极小正价格没有达到 100% 损失，不因除法舍入触发', () => {
    expect(
      evaluateV01Rule(
        { ...rule, threshold: 1, parameters: { comparisonOperator: 'lte' } },
        { ...context, price: Number.MIN_VALUE, costPrice: 1 },
      )?.triggered,
    ).toBe(false);
  });

  it('历史负阈值及无成本语义保持', () => {
    expect(
      evaluateV01Rule({ ...rule, threshold: -0.1 }, { ...context, price: 89, costPrice: 100 })
        ?.triggered,
    ).toBe(true);
    expect(
      evaluateV01Rule(
        { ...rule, kind: 'take-profit', threshold: -1 },
        { ...context, price: Number.MIN_VALUE, costPrice: 1 },
      )?.triggered,
    ).toBe(true);
    expect(evaluateV01Rule(rule, { ...context, price: 1, costPrice: 0 })).toBeNull();
  });
});

describe('领域风险阈值和新事件摘要', () => {
  it.each([
    ['cost-stop', 1 / 3, '33.333%'],
    ['take-profit', 0.26645, '26.645%'],
    ['price-above', 123.4567891, '123.456789'],
    ['cost-stop', 0, '0%'],
    ['cost-stop', 1e-9, '1E-7%'],
    ['trailing-stop', Number.MIN_VALUE, '5E-322%'],
    ['price-below', 1e-10, '1E-10'],
    ['price-below', -Number.MIN_VALUE, '-5E-324'],
  ])('%s 的 %s 展示为 %s', (kind, threshold, expected) => {
    expect(formatRiskRuleThreshold(kind as string, threshold as number)).toBe(expected);
  });

  it('新生成的事件名称保留账户标的并展示非零阈值', () => {
    const tinyRule = { ...rule, threshold: 1e-9 };
    expect(
      formatRiskEventName(tinyRule, { ...context, accountName: '账户甲', assetName: '示例标的' }),
    ).toBe('TEST.US · 示例标的 · 账户甲 · 成本止损 1E-7%');
    expect(evaluateV01Rule(tinyRule, { ...context, price: 0.9, costPrice: 1 })?.message).toBe(
      'TEST.US · 成本止损 1E-7% 已触发',
    );
  });
});
