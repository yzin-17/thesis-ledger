import type { StrategyEditorField } from './strategy-definition-editor.js';
import type { StrategyDefinitionDraft, StrategyDefinitionPath } from './strategy-definition-draft.js';
import { patchStrategyDefinitionDraft, strategyDraftRecord } from './strategy-definition-draft.js';

const field = (key: string, label: string, kind: StrategyEditorField['kind'], extras: Partial<StrategyEditorField> = {}): StrategyEditorField => ({ key, label, kind, ...extras });
const object = (key: string, label: string, context: string, optional = false) => field(key, label, 'object', { context, optional });
const choice = (key: string, label: string, choices: string[]) => field(key, label, 'choice', { choices });
const price = { type: 'constant', value: '' };
const template = { id: 'order', action: { kind: 'entry' }, order: { kind: 'market' }, validity: { kind: 'DAY' } };

export function strategyOrderEditorVariants(context: string): Record<string, StrategyDefinitionDraft> | undefined {
  if (context === 'execution') return {
    exchange: { mode: 'exchange', orderType: 'market', timeInForce: 'DAY', timing: 'nextEligibleBarOpen' },
    dailyBarOrders: { mode: 'exchange', timing: 'dailyBarOrders', orders: [{ ...template, id: 'buy' }, { ...template, id: 'exit', action: { kind: 'exit' } }] },
    nav: { mode: 'nav', requestTypes: ['subscribe', 'redeem'], timing: 'nextAvailableNav' },
  };
  if (context === 'orderInstruction') return { market: { kind: 'market' }, limit: { kind: 'limit', price }, stopMarket: { kind: 'stopMarket', price } };
  if (context === 'orderValidity') return { DAY: { kind: 'DAY' }, bars: { kind: 'bars', bars: 2 }, position: { kind: 'position' } };
  if (context === 'orderAction') return { entry: { kind: 'entry' }, exit: { kind: 'exit' }, stage: { kind: 'stage', stageId: '' }, stopLoss: { kind: 'stopLoss' }, takeProfit: { kind: 'takeProfit' } };
  return undefined;
}
export function strategyOrderEditorInitial(context: string): unknown {
  if (context === 'orderTemplate') return structuredClone(template);
  if (context === 'orderParent') return { templateId: '', activation: 'eachFill' };
  if (context === 'orderAction') return { kind: 'entry' };
  if (context === 'orderInstruction') return { kind: 'market' };
  if (context === 'orderValidity') return { kind: 'DAY' };
  return undefined;
}
export function strategyOrderEditorFields(context: string, row: StrategyDefinitionDraft): StrategyEditorField[] | undefined {
  if (context === 'execution') {
    if (row.timing === 'dailyBarOrders') return [field('orders', '委托模板', 'array', { context: 'orderTemplate' })];
    return row.mode === 'nav' ? [field('requestTypes', '申赎请求', 'array', { context: 'requestType' }), choice('timing', '执行时点', ['nextAvailableNav'])] : [choice('orderType', '订单类型', ['market']), choice('timeInForce', '有效期', ['DAY']), choice('timing', '执行时点', ['nextEligibleBarOpen'])];
  }
  if (context === 'orderTemplate') return [
    field('id', '委托标识', 'text'), object('action', '对应动作', 'orderAction'),
    object('order', '委托类型与价格', 'orderInstruction'), object('validity', '独立有效期', 'orderValidity'),
    object('parent', '关联父买单', 'orderParent', true), field('exitGroup', '关联退出组', 'text', { optional: true, help: '仅同一父单的止损与止盈共用；单条止损可不设置。' }),
  ];
  if (context === 'orderInstruction') return row.kind === 'market' ? [] : [object('price', row.kind === 'limit' ? '委托限价' : '触发价格', 'numeric')];
  if (context === 'orderValidity') return row.kind === 'bars' ? [field('bars', '有效交易根数（含激活根）', 'integer')] : [];
  if (context === 'orderAction') return row.kind === 'stage' ? [field('stageId', '阶段标识', 'text')] : [];
  if (context === 'orderParent') return [field('templateId', '父买单标识', 'text'), choice('activation', '保护激活方式', ['eachFill', 'fullFill'])];
  return undefined;
}
export const strategyOrderEditorLabels: Record<string, string> = {
  dailyBarOrders: '日线委托计划', market: '市价', limit: '限价', stopMarket: '触发后市价',
  entry: '建仓', exit: '普通退出', stage: '分档阶段', stopLoss: '保护性止损', takeProfit: '止盈',
  DAY: '激活当根结束，不跨夜', bars: '指定交易根数', position: '本轮持仓期间，可跨夜',
  eachFill: '每次成交后按量保护', fullFill: '全部成交后才保护',
};

export function editStrategyOrderTemplate(draft: StrategyDefinitionDraft, index: number, id: string | undefined) {
  const execution = strategyDraftRecord(draft.execution), orders = Array.isArray(execution.orders) ? execution.orders : [];
  const previous = strategyDraftRecord(orders[index]).id;
  const children = orders.map(strategyDraftRecord).filter(row => typeof previous === 'string' && strategyDraftRecord(row.parent).templateId === previous);
  if (id === undefined) {
    if (children.length) throw Error('委托仍被附属保护引用，请先调整其父单引用。');
    return patchStrategyDefinitionDraft(draft, ['execution', 'orders', index], undefined);
  }
  if (!id.trim()) throw Error('委托标识不能为空。');
  if (orders.some((row, n) => n !== index && strategyDraftRecord(row).id === id)) throw Error('委托标识不能重复。');
  if (orders.some((row, n) => n !== index && strategyDraftRecord(row).id === previous)) throw Error('原委托标识重复，请先确认保护归属。');
  let next = patchStrategyDefinitionDraft(draft, ['execution', 'orders', index, 'id'], id);
  orders.forEach((row, n) => {
    if (typeof previous === 'string' && strategyDraftRecord(strategyDraftRecord(row).parent).templateId === previous) next = patchStrategyDefinitionDraft(next, ['execution', 'orders', n, 'parent', 'templateId'], id);
  });
  return next;
}

/** 显式编辑标识时同步引用；删除仍有保护或委托引用的对象前先由用户调整关联。 */
export function editStrategyOrderReferences(draft: StrategyDefinitionDraft, path: StrategyDefinitionPath, value: unknown) {
  if (path[0] === 'execution' && path[1] === 'orders' && typeof path[2] === 'number') {
    if (path.length === 3 && value === undefined) return editStrategyOrderTemplate(draft, path[2], undefined);
    if (path.length === 4 && path[3] === 'id') return editStrategyOrderTemplate(draft, path[2], typeof value === 'string' ? value : '');
  }
  if (path[0] !== 'tradePlan' || path[1] !== 'stages' || typeof path[2] !== 'number') return null;
  if (!(path.length === 3 && value === undefined) && !(path.length === 4 && path[3] === 'id')) return null;
  const plan = strategyDraftRecord(draft.tradePlan), stages = Array.isArray(plan.stages) ? plan.stages : [];
  const previous = strategyDraftRecord(stages[path[2]]).id;
  const execution = strategyDraftRecord(draft.execution), orders = Array.isArray(execution.orders) ? execution.orders : [];
  const isReference = (o: unknown) => {
    const action = strategyDraftRecord(strategyDraftRecord(o).action);
    return typeof previous === 'string' && action.kind === 'stage' && action.stageId === previous;
  };
  const references = orders.filter(isReference);
  if (value === undefined) {
    if (references.length) throw Error('阶段仍被委托模板引用，请先调整相应委托。');
    return patchStrategyDefinitionDraft(draft, path, value);
  }
  if (typeof value !== 'string' || !value.trim()) throw Error('阶段标识不能为空。');
  if (stages.some((s, i) => i !== path[2] && strategyDraftRecord(s).id === value)) throw Error('阶段标识不能重复。');
  let next = patchStrategyDefinitionDraft(draft, path, value);
  orders.forEach((o, index) => {
    if (isReference(o))
      next = patchStrategyDefinitionDraft(next, ['execution', 'orders', index, 'action', 'stageId'], value);
  });
  return next;
}
