import { expect, it } from 'vitest';
import { authoringContentSchema, confirmationDraft, parseConfirmationDraft, strategySchema, type AuthoringContent, type BacktestStrategy } from '@thesis-ledger/schemas';
import { assembleDiscoveryGeneration, createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { collectUsedSignalSources } from '../../src/backtest/backtest-dependency-price.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';
import { validateAuthoringGeneration } from '../../src/strategy-authoring/authoring-semantics.js';
import { validateAuthoringModification } from '../../src/strategy-authoring/authoring-modification.js';
import { dailyOrderStrategy } from './daily-order-worker.fixture.js';
import { authoringProposal } from '../strategy-authoring/authoring-proposal.fixture.js';

async function content(): Promise<AuthoringContent> {
  const s = await dailyOrderStrategy(true), text = '空仓投入权益30%，按信号日最低价挂两根有效的买单，每次成交后用本次回测价格9保护，12止盈，不另设普通退出。';
  return authoringContentSchema.parse({ title: '独立委托样本', description: text, questions: [], requirements: [{ id: 'rules', quote: text, interpretation: text, state: 'understood', definitionPaths: [] }], runtimeIntents: [], removedRequirements: [], definitionText: '', manualChanges: [],
    confirmation: { instrumentId: 'daily-fixture', instrument: s.executionInstrument, timeframe: '1d', entrySummary: '空仓投入权益30%', exitSummary: '不另设普通退出', sizing: s.sizing, risk: [], noExtraRiskConfirmed: true, execution: { mode: 'exchange', timing: 'dailyBarOrders' }, cost: s.cost, periodsAreBarsConfirmed: true },
  });
}
const proposal = (definition: BacktestStrategy) =>
  authoringProposal(definition, [{ requirementId: 'rules', definitionPaths: ['entry', 'sizing', 'execution'] }]);

async function compiledDailyOrderStrategy(): Promise<BacktestStrategy> {
  const strategy = await dailyOrderStrategy(true);
  return {
    ...strategy,
    entryTrigger: 'rising-edge',
    signalSources: strategy.signalSources.map((source) => ({ ...source, series: ['low'] })),
  };
}

it('发现实际装配保留模型完整委托，价格来源仅在委托引用时也进入冻结依赖', async () => {
  const s = await dailyOrderStrategy(), scope = { executionInstrument: s.executionInstrument, primaryTimeframe: s.primaryTimeframe };
  const seed = createDiscoverySeed(scope, true), sourceId = seed.signalSources[0]!.id;
  if (s.execution.timing !== 'dailyBarOrders') throw new Error('fixture');
  s.execution.orders[0]!.order = { kind: 'limit', price: { type: 'series', sourceId, field: 'low' } };
  const variables = { name: s.name, series: ['low'], entry: s.entry, exit: s.exit, sizing: s.sizing, risk: s.risk, execution: s.execution };
  const result = assembleDiscoveryGeneration({ discoveryScope: scope } as never, seed, { strategy: variables }).strategy;
  expect(result.execution).toEqual(s.execution);
  expect(collectUsedSignalSources(result)).toMatchObject([{ id: sourceId, fields: ['low'] }]);
  const { execution, ...legacy } = variables;
  void execution;
  expect(assembleDiscoveryGeneration({ discoveryScope: scope } as never, seed, { strategy: legacy }).strategy.execution).toEqual(seed.execution);
});

it('编写只确认日线方式时，模型生成完整委托；缺模板或改为旧市价均拒绝', async () => {
  const c = await content(), definition = await compiledDailyOrderStrategy(), raw = proposal(definition);
  const schema = authoringOperationSchema({ input: { content: c, selection: { kind: 'generate' } } } as never);
  expect(schema.parse(raw)).toEqual(raw);
  expect(validateAuthoringGeneration(c, raw).definition).toEqual(definition);
  expect(strategySchema.safeParse({ ...definition, execution: c.confirmation!.execution }).success).toBe(false);
  const market: BacktestStrategy = { ...definition, execution: { mode: 'exchange', orderType: 'market', timeInForce: 'DAY', timing: 'nextEligibleBarOpen' } };
  expect(() => validateAuthoringGeneration(c, proposal(market))).toThrow('生成定义改变了用户确认条件');
  expect(schema.safeParse(proposal(market)).success).toBe(false);
});

it('完整确认模板保持精确约束，委托局部修改只改变授权范围并更新确认事实', async () => {
  const c = await content(), definition = await compiledDailyOrderStrategy();
  c.confirmation!.execution = definition.execution;
  c.definitionText = JSON.stringify(definition);
  const changed = structuredClone(definition);
  if (changed.execution.timing !== 'dailyBarOrders') throw new Error('fixture');
  for (const order of changed.execution.orders) if (order.parent) order.parent.activation = 'fullFill';
  expect(() => validateAuthoringGeneration(c, proposal(changed))).toThrow();
  const selection = { modificationTarget: 'execution' as const, intent: '改为全部买入成交后才保护，其余规则保持原值。' };
  const checked = validateAuthoringModification(c, selection, proposal(changed));
  expect(checked.definition).toEqual(changed);
  expect(checked.confirmation.execution).toEqual(changed.execution);
  changed.cost.slippageRate = '0';
  expect(() => validateAuthoringModification(c, selection, proposal(changed))).toThrow();
});

it('确认草稿可选按需求生成，重新打开完整委托后不丢模板', async () => {
  const c = await content(), draft = confirmationDraft(c);
  expect(draft.executionMode).toBe('dailyBarOrders');
  expect(parseConfirmationDraft(draft, c).execution).toEqual(c.confirmation!.execution);
  c.confirmation!.execution = (await dailyOrderStrategy(true)).execution;
  expect(parseConfirmationDraft(confirmationDraft(c), c).execution).toEqual(c.confirmation!.execution);
});
