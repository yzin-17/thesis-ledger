import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  backtestDailyOrderExecutionSchema,
  backtestDailyMatchingSchema,
  dailyOrderExecutionForStrategySchema,
  executionConfigSchema,
  strategySchema,
} from '../src/index.js';

const price = { type: 'constant', value: '355' } as const;
const base = () => ({
  mode: 'exchange',
  timing: 'dailyBarOrders',
  orders: [
    {
      id: 'buy',
      action: { kind: 'entry' },
      order: { kind: 'limit', price },
      validity: { kind: 'bars', bars: 2 },
    },
    { id: 'exit', action: { kind: 'exit' }, order: { kind: 'market' }, validity: { kind: 'DAY' } },
  ],
});

it('正式策略入口检查日线范围、价格来源和原样保存', () => {
  const input = JSON.parse(
    readFileSync(new URL('../fixtures/strategy-authoring.exchange.json', import.meta.url), 'utf8'),
  );
  input.execution = base();
  input.execution.orders[0].order.price = { type: 'series', sourceId: 'primary', field: 'low' };
  expect(strategySchema.parse(input)).toEqual(input);
  const unknown = structuredClone(input);
  unknown.execution.orders[0].order.price.sourceId = 'missing';
  expect(strategySchema.safeParse(unknown).success).toBe(false);
  input.primaryTimeframe = '5m';
  input.signalSources[0].timeframe = '5m';
  expect(strategySchema.safeParse(input).success).toBe(false);
});
const stop = () => ({
  id: 'stop',
  action: { kind: 'stopLoss' },
  order: { kind: 'stopMarket', price },
  validity: { kind: 'position' },
  parent: { templateId: 'buy', activation: 'eachFill' },
});

it('旧市价保持原值，新日线合同经正式执行 Schema 原样往返', () => {
  const legacy = {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  };
  expect(executionConfigSchema.parse(legacy)).toEqual(legacy);
  expect(executionConfigSchema.parse(base())).toEqual(base());
});

it('限价建仓、普通退出和单条按量止损原样往返，不要求止盈', () => {
  const input = { ...base(), orders: [...base().orders, stop()] };
  expect(backtestDailyOrderExecutionSchema.parse(JSON.parse(JSON.stringify(input)))).toEqual(input);
});
it.each(['eachFill', 'fullFill'])('明确保留父单保护方式 %s', (activation) => {
  const child = stop();
  child.parent.activation = activation;
  expect(
    backtestDailyOrderExecutionSchema.parse({ ...base(), orders: [...base().orders, child] })
      .orders[2]?.parent?.activation,
  ).toBe(activation);
});
it.each(['missing', 'stop', 'exit'])('拒绝错误父单引用 %s', (templateId) => {
  const child = stop();
  child.parent.templateId = templateId;
  expect(
    backtestDailyOrderExecutionSchema.safeParse({ ...base(), orders: [...base().orders, child] })
      .success,
  ).toBe(false);
});
it('拒绝重复模板／动作、缺少普通退出及非保护的父单', () => {
  const input = base();
  for (const orders of [
    [...input.orders, input.orders[0]],
    [input.orders[0]],
    input.orders.map((t) => ({ ...t, parent: { templateId: 'buy', activation: 'eachFill' } })),
  ])
    expect(backtestDailyOrderExecutionSchema.safeParse({ ...input, orders }).success).toBe(false);
});
it('关联组只有同父单、同激活方式的止损和止盈，独立止损不用组', () => {
  const loss = { ...stop(), exitGroup: 'protect' };
  const profit = {
    ...loss,
    id: 'profit',
    action: { kind: 'takeProfit' },
    order: { kind: 'limit', price },
  };
  const input = { ...base(), orders: [...base().orders, loss, profit] };
  expect(backtestDailyOrderExecutionSchema.safeParse(input).success).toBe(true);
  expect(
    backtestDailyOrderExecutionSchema.safeParse({ ...input, orders: input.orders.slice(0, 3) })
      .success,
  ).toBe(false);
  profit.parent = { ...profit.parent, activation: 'fullFill' };
  expect(backtestDailyOrderExecutionSchema.safeParse(input).success).toBe(false);
});
it.each(['0', '-1'])('拒绝非正委托常量 %s', (value) => {
  const input = base();
  input.orders[0]!.order = {
    kind: 'limit',
    price: { type: 'constant', value },
  } as (typeof input.orders)[0]['order'];
  expect(backtestDailyOrderExecutionSchema.safeParse(input).success).toBe(false);
});
it('冻结四项已确认政策，上限必须显式为正，未知政策不接受', () => {
  const policy = {
    conflict: 'stopFirst',
    childActivation: 'openSameBarRangeNextBar',
    partialExit: 'protectRemaining',
    liquidity: { kind: 'perBarCap', quantity: '10' },
  };
  expect(backtestDailyMatchingSchema.parse(policy)).toEqual(policy);
  expect(
    backtestDailyMatchingSchema.safeParse({
      ...policy,
      liquidity: { kind: 'perBarCap', quantity: '0' },
    }).success,
  ).toBe(false);
  expect(
    backtestDailyMatchingSchema.safeParse({ ...policy, conflict: 'takeProfitFirst' }).success,
  ).toBe(false);
});
it('价格来源必须存在并声明字段，阶段模板必须与现有阶段对应', () => {
  const context = {
    instrument: { symbol: 'AAPL', market: 'US' as const, assetType: 'stock' as const },
    timeframe: '1d' as const,
    sources: [
      {
        id: 'main',
        asset: { symbol: 'AAPL', market: 'US' as const, assetType: 'stock' as const },
        timeframe: '1d' as const,
        series: ['low' as const],
        priceCoordinate: 'actual' as const,
      },
    ],
    stageIds: [] as string[],
  };
  const schema = dailyOrderExecutionForStrategySchema(context);
  const input = base();
  input.orders[0]!.order = {
    kind: 'limit',
    price: { type: 'series', sourceId: 'main', field: 'low' },
  } as never;
  expect(schema.safeParse(input).success).toBe(true);
  const unknown = JSON.parse(JSON.stringify(input));
  unknown.orders[0].order.price.sourceId = 'unknown';
  expect(schema.safeParse(unknown).success).toBe(false);
  expect(
    dailyOrderExecutionForStrategySchema({ ...context, stageIds: ['half'] }).safeParse(input)
      .success,
  ).toBe(false);
});
