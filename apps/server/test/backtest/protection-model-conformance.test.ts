import { expect, it } from 'vitest';
import {
  fixedProtectionPlan,
  protectionCases,
  protectionPlanConforms,
} from './protection-model.fixture.js';
import {
  modelPlanConforms,
  modelExecutionConforms,
} from './trade-plan-model-evaluation.fixture.js';

it.each(['atr-protection', 'condition-protection'] as const)(
  '固定配置独立验收成对意图，不能交换保护语义：%s',
  (feature) => {
    const cases = protectionCases(feature);
    for (const enabled of [false, true]) {
      const configuration = fixedProtectionPlan(feature, enabled);
      expect(protectionPlanConforms(cases[Number(enabled)]!.id, configuration)).toBe(true);
      expect(protectionPlanConforms(cases[Number(!enabled)]!.id, configuration)).toBe(false);
    }
  },
);

it('逐期保护接受已证明等价的已持仓谓词，但不接受额外等待条件', () => {
  const configuration = fixedProtectionPlan('atr-protection', true);
  const trailing = configuration.tradePlan!.trailing!;
  trailing.activation = { kind: 'condition', condition: { type: 'positionState', field: 'isOpen' } };
  expect(protectionPlanConforms('current-atr', configuration)).toBe(true);
  trailing.activation = { kind: 'condition', condition: {
    type: 'compare',
    operator: 'gte',
    left: { type: 'positionState', field: 'holdingPeriods' },
    right: { type: 'constant', value: '2' },
  } };
  expect(protectionPlanConforms('current-atr', configuration)).toBe(false);
});

it('显式条件保护接受对应语义；立即启用或擅换 ATR 的合法结构仍判模型误选', () => {
  const configuration = fixedProtectionPlan('condition-protection', true);
  const stop = configuration.tradePlan!.initialStop!;
  const activation = stop.activation;
  if (activation?.kind !== 'condition') throw new Error('缺少条件保护夹具');
  const { condition } = activation;
  expect(protectionPlanConforms('armed-stop', configuration)).toBe(true);
  stop.activation = { kind: 'immediate' };
  expect(protectionPlanConforms('armed-stop', configuration)).toBe(false);
  configuration.tradePlan!.initialStop = {
    kind: 'entryAtr',
    sourceId: configuration.signalSources[0]!.id,
    period: 14,
    multiple: '3',
    activation: { kind: 'condition', condition },
  };
  expect(protectionPlanConforms('armed-stop', configuration)).toBe(false);
});

it.each(['60.000001', '60.005', '61', '65', '59.995'])(
  '条件保护必须在 60 的边界上穿，不能以相近阈值替代：%s',
  (threshold) => {
    const configuration = fixedProtectionPlan('condition-protection', true);
    const activation = configuration.tradePlan!.initialStop!.activation;
    if (activation?.kind !== 'condition') throw new Error('缺少条件保护夹具');
    const { condition } = activation;
    if (condition.type !== 'cross' || condition.right.type !== 'constant')
      throw new Error('缺少固定上穿条件');
    condition.right.value = threshold;
    expect(protectionPlanConforms('armed-stop', configuration)).toBe(false);
  },
);

it('发现意图采用入口固定费用，不能将固定项冲突归为模型保护误选', () => {
  const cost = { commissionRate: '0', slippageRate: '0' };
  const configuration = fixedProtectionPlan('atr-protection', true);
  configuration.cost = cost;
  expect(protectionPlanConforms('current-atr', configuration)).toBe(false);
  expect(protectionPlanConforms('current-atr', configuration, cost)).toBe(true);
  expect(modelPlanConforms('current-atr', configuration, cost)).toBe(true);
  const fills = [
    { side: 'buy', quantity: '1', price: '10', occurredAt: '2026-05-19T01:30:00Z' },
    { side: 'sell', quantity: '1', price: '9', occurredAt: '2026-05-26T01:30:00Z' },
  ];
  expect(modelExecutionConforms('current-atr', fills, cost)).toBe(true);
  expect(modelExecutionConforms('current-atr', fills)).toBe(false);
  for (const sample of protectionCases('atr-protection', cost))
    expect(sample.intent).toContain('佣金比例0、滑点比例0');
  delete configuration.tradePlan!.trailing;
  expect(protectionPlanConforms('current-atr', configuration, cost)).toBe(false);
});

it('单项与／或包装不改变布尔语义，但恒真普通退出仍拒绝', () => {
  const configuration = fixedProtectionPlan('condition-protection', false);
  if (configuration.entry.type !== 'not' || configuration.exit.type !== 'compare')
    throw new Error('缺少固定布尔条件');
  configuration.entry = { type: 'all', conditions: [configuration.entry] };
  configuration.exit = { type: 'any', conditions: [configuration.exit] };
  expect(protectionPlanConforms('unconditional-stop', configuration)).toBe(true);
  configuration.exit = {
    type: 'compare',
    operator: 'eq',
    left: { type: 'constant', value: '1' },
    right: { type: 'constant', value: '1' },
  };
  expect(protectionPlanConforms('unconditional-stop', configuration)).toBe(false);
});
