import type { BacktestDailyMatching, BacktestDailyOrder, BacktestOrderPoint, BacktestOrderState } from './backtest-order-contract.js';
import { formatDecimalNumber } from './decimal-number-display.js';

const states: Record<BacktestOrderState, string> = {
  waiting_parent: '等待父单', active: '已激活', partially_filled: '部分成交',
  filled: '全部成交', cancelled: '已撤销', expired: '已到期', rejected: '已拒绝',
};
export const backtestDailyOrderStateOptions = [
  { value: 'all', label: '全部' },
  ...(['filled', 'cancelled', 'expired', 'rejected', 'waiting_parent', 'active', 'partially_filled'] as const).map(value => ({ value, label: states[value] })),
];
function point(p: BacktestOrderPoint | undefined) {
  if (!p) return '尚未开始';
  const phase = p.phase === 'open' ? '开盘' : '区间';
  return `冻结第 ${p.barIndex + 1} 根${phase}`;
}

/** 只读原始订单事实；不从摘要或序号猜测行情日期。 */
export function backtestDailyOrderResultRows(orders: readonly BacktestDailyOrder[], liquidity?: BacktestDailyMatching['liquidity']) {
  const parentLabels = new Map(orders.filter(order => order.side === 'buy')
    .map(order => [order.id, order.action.kind === 'stage' ? '加仓' : '建仓']));
  return [...orders].sort((a, b) => b.acceptedSequence - a.acceptedSequence).map(order => {
    const action = order.action.kind === 'stage' ? `阶段 ${order.action.stageId}`
      : { entry: '建仓', exit: '普通退出', stopLoss: '保护性止损', takeProfit: '止盈' }[order.action.kind];
    const unit = order.quantityBasis === 'normalized-units' ? '研究单位' : '实际股／份';
    let price = '市价';
    if (order.price.kind === 'limit') price = `限价 ${formatDecimalNumber(order.price.price)}`;
    else if (order.price.kind === 'stopMarket') price = `触发价 ${formatDecimalNumber(order.price.price)}，触发后市价`;
    let validity: string;
    if (order.validity.kind === 'position') validity = '本轮持仓有效，可跨夜';
    else if (order.validity.kind === 'DAY') validity = '激活当根结束到期，不跨夜';
    else validity = `自激活起 ${order.validity.bars} 根有效${order.validity.bars > 1 ? '，可跨夜' : '，不跨夜'}`;
    const activation = order.activatedBarIndex === undefined ? '未激活' : `冻结第 ${order.activatedBarIndex + 1} 根建立`;
    let parent = '独立委托';
    if (order.parent) {
      let rule = `${parentLabels.get(order.parent.orderId) ?? '父单'}成交后保护`;
      if (liquidity?.kind !== 'wholeOrder')
        rule = order.parent.activation === 'eachFill' ? '每次成交后按量保护' : '全部成交后才保护';
      parent = `父单 ${order.parent.orderId}；${rule}`;
    }
    return {
      id: order.id, templateId: order.templateId, cycleId: order.cycleId, stateCode: order.state,
      identity: `${order.templateId}\n${order.id}`, action: `${action}（${order.side === 'buy' ? '买入' : '卖出'}）`, state: states[order.state],
      quantity: `目标 ${formatDecimalNumber(order.quantity)}\n已成交 ${formatDecimalNumber(order.filledQuantity)}\n未成交 ${formatDecimalNumber(order.remainingQuantity)}\n${unit}`,
      terms: `${price}\n${validity}\n${parent}${order.exitGroup ? `\n退出组 ${order.exitGroup}` : ''}`,
      timing: `${activation}\n最早撮合：${point(order.eligibleFrom)}${order.price.kind === 'stopMarket' ? `\n触发：${order.triggeredAt ? point(order.triggeredAt) : '未触发'}` : ''}`,
      search: `${order.templateId} ${order.id} ${order.cycleId} ${order.parent?.orderId ?? ''} ${order.exitGroup ?? ''}`.toLowerCase(),
    };
  });
}
