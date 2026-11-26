import { expect, it } from 'vitest';
import { z } from 'zod';
import {
  strategySchema,
  projectPriceResearchStrategy,
  authoringStrategySchema,
  optimizationDiscoveryGenerationOutputSchema,
  authoringGenerationOutputSchema,
  authoringModificationOutputSchema,
  authoringOperationGenerationSchema,
  authoringConfirmationSchema,
  aiGenerationContracts,
} from '../src/index.js';

const asset = { symbol: '159516.SZ', market: 'CN', assetType: 'etf' };
const condition = {
  type: 'compare',
  operator: 'gt',
  left: {
    type: 'indicator',
    name: 'RSI',
    input: { type: 'series', sourceId: 'main', field: 'close' },
    params: { period: 20 },
  },
  right: { type: 'constant', value: '50' },
};
const plan = {
  version: 1,
  evaluation: 'barClose',
  stages: [],
  trailing: {
    kind: 'currentAtr',
    sourceId: 'main',
    period: 14,
    multiple: '2',
    activation: { kind: 'condition', condition },
  },
};
const strategy = {
  schemaVersion: 'strategy-definition-v1',
  name: '独立保护样本',
  executionInstrument: asset,
  primaryTimeframe: '1d',
  signalSources: [{ id: 'main', asset, timeframe: '1d', priceCoordinate: 'research', series: ['high', 'low', 'close'] }],
  entry: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
  exit: {
    type: 'compare',
    operator: 'eq',
    left: { type: 'constant', value: '0' },
    right: { type: 'constant', value: '1' },
  },
  sizing: { type: 'percentOfEquity', percent: '0.25' },
  risk: [],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0', slippageRate: '0' },
  tradePlan: plan,
};

it('范围外修改保留现有启用条件，现行入口拒绝旧字段和重复启用方式', () => {
  const { activation: activationPolicy, ...distance } = plan.trailing;
  const legacy = {
    ...strategy,
    tradePlan: { ...plan, trailing: { ...distance, activateWhen: condition } },
  };
  expect(strategySchema.safeParse(legacy).success).toBe(false);
  expect(authoringModificationOutputSchema.safeParse({ definition: legacy, coverage: [] }).success)
    .toBe(false);
  expect(
    authoringModificationOutputSchema.parse({ definition: strategy, coverage: [] }).definition
      .tradePlan,
  ).toEqual(plan);
  const other = authoringOperationGenerationSchema({ baseline: strategy, target: 'entry' });
  expect(other.parse({ definition: strategy, coverage: [] }).definition.tradePlan).toEqual(
    plan,
  );
  const changed = authoringOperationGenerationSchema({ baseline: strategy, target: 'tradePlan' });
  expect(changed.safeParse({ definition: legacy, coverage: [] }).success).toBe(false);
  expect(changed.parse({ definition: strategy, coverage: [] }).definition.tradePlan).toEqual(plan);
  for (const activation of [
    { kind: 'condition' },
    { kind: 'immediate', condition },
    { kind: 'other' },
  ])
    expect(
      strategySchema.safeParse({
        ...strategy,
        tradePlan: { ...plan, trailing: { ...distance, activation } },
      }).success,
    ).toBe(false);
  expect(
    strategySchema.safeParse({
      ...legacy,
      tradePlan: {
        ...plan,
        trailing: { ...legacy.tradePlan.trailing, activation: activationPolicy },
      },
    }).success,
  ).toBe(false);
});

it('正式根、编写和精简入口原样保留逐期ATR与条件，未知源和缺少high/low拒绝', () => {
  expect(strategySchema.parse(strategy).tradePlan).toEqual(plan);
  expect(authoringStrategySchema.parse(JSON.stringify(strategy)).tradePlan).toEqual(plan);
  expect(
    optimizationDiscoveryGenerationOutputSchema.parse({
      strategy: {
        name: strategy.name,
        entry: strategy.entry,
        exit: strategy.exit,
        sizing: strategy.sizing,
        series: ['high', 'low', 'close'],
        risk: [],
        tradePlan: plan,
      },
    }).strategy.tradePlan,
  ).toEqual(plan);
  for (const source of [
    { ...strategy.signalSources[0], id: 'missing' },
    { ...strategy.signalSources[0], series: ['close'] },
    { ...strategy.signalSources[0], priceCoordinate: 'actual' },
  ])
    expect(strategySchema.safeParse({ ...strategy, signalSources: [source] }).success).toBe(false);
  expect(
    strategySchema.safeParse({
      ...strategy,
      tradePlan: {
        ...plan,
        trailing: {
          ...plan.trailing,
          activation: {
            kind: 'condition',
            condition: {
              ...condition,
              left: { type: 'series', sourceId: 'unknown', field: 'close' },
            },
          },
        },
      },
    }).success,
  ).toBe(false);
});

it('条件与普通规则同等验证；风险预算拒绝尚未启用的初始保护', () => {
  expect(
    strategySchema.safeParse({
      ...strategy,
      tradePlan: {
        ...plan,
        initialStop: {
          kind: 'percent',
          percent: '0.05',
          activation: { kind: 'condition', condition },
        },
        riskBudget: { equityFraction: '0.01', maxEquityFraction: '0.5' },
      },
    }).success,
  ).toBe(false);
  for (const bad of [
    { type: 'constant', value: '1' },
    { ...condition, left: { type: 'positionState', field: 'isOpen' } },
    { ...condition, left: { ...condition.left, params: {} } },
  ])
    expect(
      strategySchema.safeParse({
        ...strategy,
        tradePlan: {
          ...plan,
          trailing: { ...plan.trailing, activation: { kind: 'condition', condition: bad } },
        },
      }).success,
    ).toBe(false);
  const projected = projectPriceResearchStrategy(strategySchema.parse(strategy));
  expect(projected.tradePlan).toEqual(plan);
  expect(projected.signalSources).toHaveLength(1);
});

it('条件保护首期只允许同标的、同主周期数据，不能借其他持仓或周期启用', () => {
  for (const extra of [
    { ...strategy.signalSources[0], id: 'other', asset: { ...asset, symbol: '510300.SH' } },
    { ...strategy.signalSources[0], id: 'other', timeframe: '60m' },
  ]) {
    const result = strategySchema.safeParse({
      ...strategy,
      signalSources: [...strategy.signalSources, extra],
      tradePlan: {
        ...plan,
        trailing: {
          ...plan.trailing,
          activation: {
            kind: 'condition',
            condition: {
              ...condition,
              left: {
                ...condition.left,
                input: { type: 'series', sourceId: 'other', field: 'close' },
              },
            },
          },
        },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some(
          (issue) => issue.message === '保护启用条件首期只支持同标的、同主周期来源',
        ),
      ).toBe(true);
  }
});

it('三个具名生成合同的原生 Schema 保留完整保护条件 AST', () => {
  for (const contract of [
    aiGenerationContracts.strategyDiscovery,
    aiGenerationContracts.authoringGeneration,
    aiGenerationContracts.authoringModification,
  ]) {
    expect(contract.ref.version.endsWith('-v1')).toBe(true);
    const json = JSON.stringify(z.toJSONSchema(contract.schema, { target: 'draft-7' }));
    expect(json).toContain('currentAtr');
    expect(json).toContain('activation');
    expect(json).toContain('conditions');
  }
});

it('编写与修改的原生入场退出只接受布尔树，不能把数值常量当退出条件', () => {
  for (const schema of [authoringGenerationOutputSchema, authoringModificationOutputSchema]) {
    const definition = {
      ...strategy,
      schemaVersion: 'strategy-definition-v1',
      signalSources: strategy.signalSources.map((s) => ({ ...s, priceCoordinate: 'research' })),
    };
    expect(schema.safeParse({ definition, coverage: [] }).success).toBe(true);
    for (const key of ['entry', 'exit']) {
      const result = schema.safeParse({
        definition: { ...definition, [key]: { type: 'constant', value: '1' } },
        coverage: [],
      });
      expect(result.success).toBe(false);
    }
  }
});

it('编写与修改均要求现行定义和价格坐标', () => {
  const generated = authoringGenerationOutputSchema.shape.definition;
  const json = z.toJSONSchema(generated, { target: 'draft-7' });
  expect(json.properties?.signalSources).toMatchObject({
    items: { required: expect.arrayContaining(['priceCoordinate']) },
  });
  expect(
    authoringGenerationOutputSchema.safeParse({
      definition: {
        ...strategy,
        signalSources: strategy.signalSources.map(({ id, asset, timeframe }) => ({ id, asset, timeframe })),
      },
      coverage: [],
    }).success,
  ).toBe(false);
  expect(
    authoringModificationOutputSchema.safeParse({ definition: strategy, coverage: [] }).success,
  ).toBe(true);
  expect(
    authoringModificationOutputSchema.safeParse({
      definition: { ...strategy, schemaVersion: '2' },
      coverage: [],
    }).success,
  ).toBe(false);
});

it('生成投影冻结用户已确认事实，计划和所需行情字段仍由模型填写', () => {
  const confirmation = authoringConfirmationSchema.parse({
    instrumentId: 'isolated',
    instrument: asset,
    timeframe: '1d',
    entrySummary: '空仓买入',
    exitSummary: '条件保护',
    sizing: strategy.sizing,
    risk: [],
    noExtraRiskConfirmed: true,
    execution: strategy.execution,
    cost: strategy.cost,
    periodsAreBarsConfirmed: true,
  });
  const schema = authoringOperationGenerationSchema({ confirmation });
  const native = z.toJSONSchema(schema, { target: 'draft-7' });
  const variants = native.properties!.definition as { anyOf: unknown[] };
  for (const variant of variants.anyOf)
    expect(variant).toMatchObject({
      properties: {
        signalSources: {
          items: {
            properties: {
              priceCoordinate: { enum: ['research', 'actual', 'run'] },
              series: { items: { enum: ['open', 'high', 'low', 'close', 'volume'] } },
            },
          },
        },
      },
    });
  const fundSchema = authoringOperationGenerationSchema({
    confirmation: {
      ...confirmation,
      instrument: { ...confirmation.instrument, assetType: 'fund' },
    },
  });
  const fundNative = z.toJSONSchema(fundSchema, { target: 'draft-7' });
  const fundVariants = fundNative.properties!.definition as { anyOf: unknown[] };
  for (const variant of fundVariants.anyOf)
    expect(variant).toMatchObject({
      properties: {
        signalSources: {
          items: {
            properties: {
              priceCoordinate: { const: 'native-nav' },
              series: { items: { const: 'nav' } },
            },
          },
        },
      },
    });
  const definition = {
    ...strategy,
    schemaVersion: 'strategy-definition-v1',
    signalSources: strategy.signalSources.map((s) => ({ ...s, priceCoordinate: 'research' })),
  };
  const output = { definition, coverage: [] };
  expect(schema.safeParse(output).success).toBe(true);
  for (const patch of [
    { risk: [{ type: 'fixedStop', percent: '0.05' }] },
    { sizing: { type: 'fixedAmount', amount: '1000' } },
    { cost: { ...strategy.cost, commissionRate: '0.01' } },
    {
      signalSources: [{ ...definition.signalSources[0], asset: { ...asset, symbol: '510300.SH' } }],
    },
  ])
    expect(schema.safeParse({ ...output, definition: { ...definition, ...patch } }).success).toBe(
      false,
    );
  expect(
    schema.safeParse({
      ...output,
      definition: {
        ...definition,
        tradePlan: { ...plan, trailing: { ...plan.trailing, sourceId: 'unknown' } },
      },
    }).success,
  ).toBe(false);
});

it('局部计划投影不能改基线其他字段，也不自动补计划；省略可移除计划', () => {
  const schema = authoringOperationGenerationSchema({ baseline: strategy, target: 'tradePlan' });
  const withoutPlan = { ...strategy };
  delete withoutPlan.tradePlan;
  expect(schema.safeParse({ definition: withoutPlan, coverage: [] }).success).toBe(true);
  for (const patch of [
    { name: '修改名称' },
    { description: '额外字段' },
    { risk: [{ type: 'fixedStop', percent: '0.05' }] },
  ])
    expect(schema.safeParse({ definition: { ...strategy, ...patch }, coverage: [] }).success).toBe(
      false,
    );
  const document = z.toJSONSchema(schema, { target: 'draft-7' });
  expect(JSON.stringify(document)).toContain('activation');
  const definition = document.properties!.definition as {
    anyOf: Array<{ properties: object; required: string[] }>;
  };
  expect(definition.anyOf).toHaveLength(2);
  expect(definition.anyOf[0]!.required[0]).toBe('tradePlan');
  expect(Object.keys(definition.anyOf[0]!.properties)[0]).toBe('tradePlan');
  expect(definition.anyOf[1]!.properties).not.toHaveProperty('tradePlan');
});

it('操作传输把覆盖与实际计划绑定，只解包建议，不补计划或改写完整定义', () => {
  const schema = authoringOperationGenerationSchema({
    baseline: strategy,
    target: 'tradePlan',
    requirementIds: ['rules'],
  });
  const proposal = {
    coverage: [{ requirementId: 'rules', definitionPaths: ['entry', 'tradePlan'] }],
    definition: strategy,
  };
  const intentCheck = '核对本次保护、启用条件与冷却，文本不参与配置执行';
  expect(schema.parse({ intentCheck, proposal })).toEqual(proposal);
  expect(schema.safeParse({ proposal }).success).toBe(false);
  expect(schema.parse({ intentCheck: '即使文本与配置不一致，也只能执行配置', proposal })).toEqual(
    proposal,
  );
  expect(schema.safeParse(proposal).success).toBe(false);
  const withoutPlan = { ...strategy };
  delete withoutPlan.tradePlan;
  expect(
    schema.safeParse({ intentCheck, proposal: { ...proposal, definition: withoutPlan } }).success,
  ).toBe(false);
  const removed = {
    ...proposal,
    definition: withoutPlan,
    coverage: [{ requirementId: 'rules', definitionPaths: ['entry'] }],
  };
  expect(schema.parse({ intentCheck, proposal: removed })).toEqual(removed);
  expect(
    schema.safeParse({
      intentCheck,
      proposal: {
        ...proposal,
        definition: { ...strategy, risk: [{ type: 'fixedStop', percent: '0.03' }] },
      },
    }).success,
  ).toBe(false);
});
