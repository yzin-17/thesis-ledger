import { describe, expect, it } from 'vitest';
import { evaluateV01Rule } from '../src/index.js';

const base = {
  id: 'detached-rule',
  version: 1,
  scope: 'security' as const,
  severity: 'warning' as const,
  enabled: true,
};

const context = {
  symbol: '600519.SH',
  price: 92,
  costPrice: 100,
  marketTime: '2026-09-11T08:00:00Z',
};

describe('策略规则复制为独立手工规则', () => {
  it('旧成本止损在等号边界仍保持严格小于', () => {
    expect(
      evaluateV01Rule({ ...base, kind: 'cost-stop', threshold: 0.08 }, context)?.triggered,
    ).toBe(false);
  });

  it('复制的成本止损可通过 comparisonOperator 保留 <= 边界', () => {
    expect(
      evaluateV01Rule(
        {
          ...base,
          kind: 'cost-stop',
          threshold: 0.08,
          parameters: {
            comparisonOperator: 'lte',
            semanticVersion: 'strategy-monitoring-v1-detached',
          },
        },
        context,
      )?.triggered,
    ).toBe(true);
  });

  it('旧止盈保持严格大于，复制规则可保留 >= 边界', () => {
    const takeProfitContext = { ...context, price: 120 };
    expect(
      evaluateV01Rule({ ...base, kind: 'take-profit', threshold: 0.2 }, takeProfitContext)?.triggered,
    ).toBe(false);
    expect(
      evaluateV01Rule(
        {
          ...base,
          kind: 'take-profit',
          threshold: 0.2,
          parameters: {
            comparisonOperator: 'gte',
            semanticVersion: 'strategy-monitoring-v1-detached',
          },
        },
        takeProfitContext,
      )?.triggered,
    ).toBe(true);
  });
});
