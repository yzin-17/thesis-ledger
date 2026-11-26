import { authoringContentSchema, projectPriceResearchStrategy, strategySchema, type BacktestStrategy, type Expression } from '@thesis-ledger/schemas';
import { dailyOrderStrategy, dailyPolicy } from './daily-order-worker.fixture.js';
import { tradePlanSnapshot } from './trade-plan-snapshot.fixture.js';
import { DecimalValue as D } from '@thesis-ledger/domain';

const decimalEqual = (value: string | undefined, expected: string) => value !== undefined && D.from(value).compareTo(expected) === 0;

export const dailyModelDiscoveryObjective = { mode: 'balanced', minClosedTrades: 0 } as const;

const common = '空仓投入权益30%。不另设普通退出或独立风险控制，全部平仓后等待1根完整日线再检查入场。';
const limit = '以信号日最低价挂限价买单，后续两根交易日线有效。';
const market = '下一可交易开盘按市价买入，买单后续两根交易日线有效。';
const protect = '买入每次成交后立即按本计划已买入且尚未卖出的数量保护，跌到本次模拟计价的9时触发市价卖出；保护持续到本轮持仓结束，可跨夜，不另设止盈。';
export const dailyModelCases = [
  { id: 'limit', pair: 'order-kind', intent: common + limit },
  { id: 'market', pair: 'order-kind', intent: common + market },
  { id: 'touch', pair: 'protection-timing', intent: common + '下一可交易开盘按市价买入，买单仅当天有效。' + protect },
  { id: 'close', pair: 'protection-timing', intent: common + '下一可交易开盘按市价买入，买单仅当天有效。每个完成收盘若比首笔成交价下跌10%，在后续可交易开盘全部卖出，盘中不因这条保护卖出。' },
  { id: 'each-fill', pair: 'activation', intent: common + limit + protect },
  { id: 'full-fill', pair: 'activation', intent: common + limit + '只有买单全部成交后才按本计划尚未卖出的数量建立保护，跌到本次模拟计价的9时触发市价卖出；保护持续到本轮持仓结束，可跨夜，不另设止盈。部分成交后撤掉余单不启用保护。' },
  { id: 'day', pair: 'validity', intent: common + '以信号日最低价挂限价买单，仅后续首个交易日当天有效，不跨夜留买单。' + protect },
  { id: 'two-bars', pair: 'validity', intent: common + limit + protect },
] as const;
export type DailyModelCase = typeof dailyModelCases[number];

export async function fixedDailyModelCase(sample: DailyModelCase): Promise<BacktestStrategy> {
  const s = await dailyOrderStrategy(false);
  s.signalSources = s.signalSources.map(source => ({ ...source, priceCoordinate: 'research' }));
  s.name = '独立日线委托 ' + sample.id;
  s.description = sample.intent;
  s.entry = { type: 'not', expression: { type: 'positionState', field: 'isOpen' } };
  s.sizing = { type: 'percentOfEquity', percent: '0.3' };
  s.tradePlan = { version: 1, evaluation: 'barClose', stages: [], cooldown: { bars: 1, stopBars: 1 } };
  if (s.execution.timing !== 'dailyBarOrders') throw new Error('fixture');
  const buy = s.execution.orders[0]!;
  if (['market', 'touch', 'close'].includes(sample.id)) buy.order = { kind: 'market' };
  if (['day', 'touch', 'close'].includes(sample.id)) buy.validity = { kind: 'DAY' };
  if (!['limit', 'market', 'close'].includes(sample.id)) s.execution.orders.push({
    id: 'stop', action: { kind: 'stopLoss' }, order: { kind: 'stopMarket', price: { type: 'constant', value: '9' } },
    validity: { kind: 'position' }, parent: { templateId: buy.id, activation: sample.id === 'full-fill' ? 'fullFill' : 'eachFill' },
  });
  if (sample.id === 'close') s.tradePlan.initialStop = { kind: 'percent', percent: '0.1', activation: { kind: 'immediate' } };
  return projectPriceResearchStrategy(strategySchema.parse(s) as BacktestStrategy);
}

export function dailyModelContent(sample: DailyModelCase, definition: BacktestStrategy, modifying: boolean) {
  return authoringContentSchema.parse({
    title: definition.name, description: sample.intent, questions: [],
    requirements: [{ id: 'rules', quote: sample.intent, interpretation: sample.intent, state: 'understood', definitionPaths: [] }],
    runtimeIntents: [], removedRequirements: [], definitionText: modifying ? JSON.stringify(definition) : '', manualChanges: [],
    confirmation: {
      instrumentId: 'daily-model-fixture', instrument: definition.executionInstrument, timeframe: '1d', entrySummary: '空仓投入权益30%', exitSummary: '仅按所述保护退出，平仓后等1根完整日线',
      sizing: definition.sizing, risk: [], noExtraRiskConfirmed: true,
      execution: modifying ? definition.execution : { mode: 'exchange', timing: 'dailyBarOrders' }, cost: definition.cost, periodsAreBarsConfirmed: true,
    },
  });
}

export async function dailyModelBaseline(sample: DailyModelCase) {
  if (sample.id === 'close' || sample.id === 'touch') {
    const before = await fixedDailyModelCase(sample);
    if (sample.id === 'close') before.tradePlan!.initialStop = { kind: 'percent', percent: '0.05', activation: { kind: 'immediate' } };
    else if (before.execution.timing === 'dailyBarOrders') {
      const stop = before.execution.orders.find(o => o.action.kind === 'stopLoss')!;
      stop.order = { kind: 'stopMarket', price: { type: 'constant', value: '8' } };
    }
    return before;
  }
  const index = dailyModelCases.indexOf(sample);
  return fixedDailyModelCase(dailyModelCases[index % 2 === 0 ? index + 1 : index - 1]!);
}

export function dailyModelModification(sample: DailyModelCase) {
  return {
    modificationTarget: sample.id === 'close' ? 'tradePlan' as const : 'execution' as const,
    intent: sample.id === 'close'
      ? '仅把收盘保护改为首笔成交价下方10%，后续可交易开盘退出；其他全部规则和元数据保持原值。'
      : '仅修改委托计划为：' + sample.intent + '委托以外的全部规则和元数据保持原值。',
  };
}

function booleanAt(n: Expression, open: boolean): boolean | null {
  if (n?.type === 'positionState' && n.field === 'isOpen') return open;
  if (n?.type === 'not') { const v = booleanAt(n.expression, open); return v === null ? null : !v; }
  if (n?.type === 'all' || n?.type === 'any') {
    const v = n.conditions.map(x => booleanAt(x, open));
    if (v.includes(null)) return null;
    return n.type === 'all' ? v.every(Boolean) : v.some(Boolean);
  }
  if (n?.type === 'compare' && n.left?.type === 'constant' && n.right?.type === 'constant') {
    const compared = D.from(n.left.value).compareTo(n.right.value);
    return ({ eq: compared === 0, neq: compared !== 0, gt: compared > 0, gte: compared >= 0, lt: compared < 0, lte: compared <= 0 } as Record<string, boolean>)[n.operator] ?? null;
  }
  return null;
}

/** 只比较模型原值，不从摘要补规则；允许布尔常量条件的等价写法。 */
export function dailyModelIssues(sample: DailyModelCase, s: BacktestStrategy): string[] {
  const errors: string[] = [];
  const check = (ok: boolean, text: string) => { if (!ok) errors.push(text); };
  check(booleanAt(s.entry, false) === true && booleanAt(s.entry, true) === false, '入场不是仅空仓');
  check(booleanAt(s.exit, false) === false && booleanAt(s.exit, true) === false, '擅加普通退出');
  check(s.sizing.type === 'percentOfEquity' && decimalEqual(s.sizing.percent, '0.3'), '普通投入不是30%');
  check(s.risk.length === 0, '额外独立风控');
  const p = s.tradePlan;
  check(!!p && p.stages.length === 0 && p.cooldown?.bars === 1 && (p.cooldown.stopBars === undefined || p.cooldown.stopBars === 1), '阶段或平仓等待不符');
  check(!!p && !p.riskBudget && !p.trailing && !p.lossPause && !p.monthlyRebalance && !p.volatilityTarget, '额外计划控制');
  if (sample.id === 'close') check(p?.initialStop?.kind === 'percent' && decimalEqual(p.initialStop.percent, '0.1') && p.initialStop.activation?.kind === 'immediate', '收盘10%保护不符');
  else check(!p?.initialStop, '擅加收盘保护');
  if (s.execution.timing !== 'dailyBarOrders') return [...errors, '未生成日线委托'];
  const orders = s.execution.orders, buy = orders.find(o => o.action.kind === 'entry'), exit = orders.find(o => o.action.kind === 'exit'), stop = orders.find(o => o.action.kind === 'stopLoss');
  const market = ['market', 'touch', 'close'].includes(sample.id);
  check(!!buy && (market ? buy.order.kind === 'market' : buy.order.kind === 'limit' && buy.order.price.type === 'series' && buy.order.price.field === 'low'), '买单类型或价格不符');
  check(!!buy && (['day', 'touch', 'close'].includes(sample.id) ? buy.validity.kind === 'DAY' : buy.validity.kind === 'bars' && buy.validity.bars === 2), '买单期限不符');
  check(exit?.order.kind === 'market' && exit.validity.kind === 'DAY', '普通退出模板不符');
  if (['limit', 'market', 'close'].includes(sample.id)) check(orders.length === 2 && !stop, '擅加附属保护');
  else {
    check(orders.length === 3 && !!stop && !stop.exitGroup, '保护腿或退出组不符');
    check(stop?.order.kind === 'stopMarket' && stop.order.price.type === 'constant' && decimalEqual(stop.order.price.value, '9'), '触价保护不符');
    check(stop?.validity.kind === 'position' && stop.parent?.templateId === buy?.id && stop.parent?.activation === (sample.id === 'full-fill' ? 'fullFill' : 'eachFill'), '父单、激活或保护跨夜不符');
  }
  return errors;
}

export function dailyModelSnapshot(root: string, sample: DailyModelCase, strategy: BacktestStrategy) {
  const timed = sample.pair === 'protection-timing';
  return tradePlanSnapshot(root, strategy, {
    dates: timed ? ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21'] : ['2026-05-18', '2026-05-19', '2026-05-20'],
    closes: timed ? [10, 10, 8.5, 8.5] : [10, 10, 10],
    opens: timed ? [10, 10, 8.5, 8.5] : [10, 10, sample.pair === 'activation' ? 8.5 : 10],
    intrabarRange: 0.5, dailyOrderMatching: dailyPolicy,
  });
}

export function dailyModelExecutionIssues(sample: DailyModelCase, fills: readonly { side: string; quantity: string; price: string; occurredAt: string }[]) {
  const expected: Record<DailyModelCase['id'], [string, string, string][]> = {
    limit: [['buy', '100', '2026-05-19'], ['buy', '100', '2026-05-20']],
    market: [['buy', '100', '2026-05-19'], ['buy', '100', '2026-05-20']],
    touch: [['buy', '100', '2026-05-19'], ['sell', '100', '2026-05-20']],
    close: [['buy', '100', '2026-05-19'], ['sell', '100', '2026-05-21']],
    'each-fill': [['buy', '100', '2026-05-19'], ['sell', '100', '2026-05-20']],
    'full-fill': [['buy', '100', '2026-05-19'], ['buy', '100', '2026-05-20']],
    day: [['buy', '100', '2026-05-19']],
    'two-bars': [['buy', '100', '2026-05-19'], ['buy', '100', '2026-05-20']],
  };
  const actual = fills.map(f => [f.side, f.quantity, f.occurredAt.slice(0, 10)]);
  const issues = JSON.stringify(actual) === JSON.stringify(expected[sample.id]) ? [] : ['成交方向、数量或日期不符'];
  if (sample.id === 'limit' && fills.some(f => Number(f.price) > 9.5)) issues.push('限价突破边界');
  if (sample.id === 'market' && fills.some(f => Number(f.price) < 10)) issues.push('市价未按开盘撮合');
  return issues;
}
