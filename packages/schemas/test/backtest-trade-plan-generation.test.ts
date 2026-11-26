import { expect, it } from 'vitest';
import { z } from 'zod';
import { backtestTradePlanSchema } from '../src/backtest-trade-plan.js';
import { generatedTradePlanSchema } from '../src/backtest-trade-plan-generation.js';

const condition = { type: 'positionState', field: 'isOpen' };
const stop = { kind: 'percent', percent: '0.05' };
const atr = { kind: 'entryAtr', sourceId: 'main', period: 2, multiple: '2' };
const stage = {
  id: 'half',
  trigger: { kind: 'gainPercent', value: '0.1' },
  action: { kind: 'reduce', basis: 'remainingQuantity', fraction: '0.5' },
};
const controllers = {
  riskBudget: { equityFraction: '0.01', maxEquityFraction: '0.5' },
  monthlyRebalance: {
    targetEquityFraction: '0.3',
    deviationThreshold: '0.03',
    evaluation: 'lastTradingDayClose',
  },
  volatilityTarget: {
    returnPeriods: 20,
    targetAnnualVolatility: '0.1',
    maxEquityFraction: '0.5',
    annualizationPeriods: 252,
    returnKind: 'simple',
    variance: 'sample',
    update: 'dailyClose',
  },
};
const explicitProtection = (rule: object | undefined) => {
  if (!rule) return undefined;
  const { activateWhen, ...distance } = rule as Record<string, unknown>;
  return {
    activation: activateWhen
      ? { kind: 'condition', condition: activateWhen }
      : { kind: 'immediate' },
    ...distance,
  };
};

it('显式启用方式保留原保护、阶段及仓位控制的合法组合，模型配置不被改写', () => {
  let accepted = 0;
  for (const initialStop of [
    undefined,
    stop,
    atr,
    { ...stop, activateWhen: condition },
    { ...atr, activateWhen: condition },
  ])
    for (const trailing of [
      undefined,
      { drawdownPercent: '0.05' },
      { ...atr, kind: 'currentAtr' },
      { ...atr, kind: 'currentAtr', activateWhen: condition },
    ])
      for (const stages of [
        [],
        [stage],
        [{ ...stage, trigger: { kind: 'entryAtrMultiple', value: '2' } }],
        [stage, stage],
      ])
        for (let mask = 0; mask < 8; mask++) {
          const allocations = Object.fromEntries(
            Object.entries(controllers).filter((_, index) => mask & (1 << index)),
          );
          const plan = {
            version: 1,
            evaluation: 'barClose',
            stages,
            initialStop,
            trailing,
            cooldown: { bars: 10, stopBars: 10 },
            lossPause: { completedTrades: 3, tradingDays: 10, pnlBasis: 'fillsNetOfFees' },
            ...allocations,
          };
          const modelPlan = {
            ...plan,
            initialStop: explicitProtection(initialStop),
            trailing: explicitProtection(trailing),
          };
          const canonical = backtestTradePlanSchema.safeParse(modelPlan);
          const generated = generatedTradePlanSchema.safeParse(modelPlan);
          expect(generated.success, JSON.stringify(modelPlan)).toBe(canonical.success);
          if (canonical.success && generated.success) {
            accepted++;
            expect(generated.data).toEqual(canonical.data);
          }
        }
  expect(accepted).toBeGreaterThan(100);
});

it('模型可见的 JSON Schema 直接约束互斥控制和无条件初始保护，不仅依靠最终 refinement', () => {
  const document = z.toJSONSchema(generatedTradePlanSchema);
  const branches = document.anyOf as Array<{
    required: string[];
    additionalProperties: boolean;
    properties: Record<
      string,
      {
        maxItems?: number;
        anyOf?: Array<{ properties: object; required?: string[] }>;
      }
    >;
  }>;
  expect(branches).toHaveLength(4);
  for (const branch of branches) {
    expect(branch.additionalProperties).toBe(false);
    const controlKeys = Object.keys(branch.properties).filter((key) => key in controllers);
    expect(controlKeys.length).toBeLessThanOrEqual(1);
    if (controlKeys[0]) {
      // 特殊分支必须先显式选择本身的控制，不能以无预算的保护子集与普通分支重叠。
      expect(branch.required[0]).toBe(controlKeys[0]);
      expect(Object.keys(branch.properties)[0]).toBe(controlKeys[0]);
    } else expect(branch.required.slice(0, 3)).toEqual(['version', 'evaluation', 'stages']);
    if (controlKeys[0] === 'riskBudget') {
      expect(branch.required).toContain('initialStop');
      expect(branch.required).toContain('riskBudget');
      for (const variant of branch.properties.initialStop!.anyOf!)
        expect(variant.properties).not.toHaveProperty('activateWhen');
    } else if (controlKeys.length) expect(branch.properties.stages?.maxItems).toBe(0);
  }
  expect(Object.keys(branches[0]!.properties)).toEqual([
    'version',
    'evaluation',
    'stages',
    'initialStop',
    'trailing',
    'cooldown',
    'lossPause',
  ]);
  for (const field of ['initialStop', 'trailing']) {
    const variants = branches[0]!.properties[field]!.anyOf!;
    expect(variants).toHaveLength(2);
    for (const variant of variants) {
      expect(variant.properties).toHaveProperty('activation');
      expect(variant.properties).not.toHaveProperty('activateWhen');
      expect(variant.required?.at(-1)).toBe('activation');
      expect(variant.required?.[0]).not.toBe('activation');
    }
  }
  expect(
    generatedTradePlanSchema.parse({ version: 1, evaluation: 'barClose', stages: [] }),
  ).toEqual({
    version: 1,
    evaluation: 'barClose',
    stages: [],
  });
});
