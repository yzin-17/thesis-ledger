// 用户意图不提示字段名；固定样本、实际生成与捕获回放共用事件，不修补模型配置。
const entry = '现在空仓。以359.50美元限价买入27股AAPL，入场单到今天收盘有效；';
const exits = '涨到375时卖出本批累计实际买到数量的三分之一，按每手一股向下取整并扣除本档已经卖出的数量；355止损覆盖本批全部余仓。止盈不取消止损，两种退出都有效至11月16日收盘。';
export const stagedPartialIntentCases = [
  { id: 'staged_each_keep', intent: entry + '每成交一部分就立即按实际已买数量建立分档退出。' + exits + '保护退出后保留未买到的入场余量；新增买入只补充新增档位额度，不重置本档已卖数量。' },
  { id: 'staged_each_cancel', intent: entry + '每成交一部分就立即按实际已买数量建立分档退出。' + exits + '任意退出首次成交就撤掉尚未买到的入场余量，已买余仓仍保留保护。' },
];
export const isStagedPartialCase = s => s.id.startsWith('staged_each_');
export function stagedPartialEvents(sample, minuteAt) {
  const prices = [...Array(5).fill('359'), ...Array(2).fill('380')];
  if (sample.id === 'staged_each_keep') prices.push(...Array(5).fill('359'), ...Array(2).fill('380'),
    ...Array(4).fill('359'), ...Array(2).fill('380'), ...Array(9).fill('350'));
  else prices.push(...Array(4).fill('350'));
  return prices.map((price, i) => ({ at: minuteAt(i + 1), price }));
}
export function stagedPartialConfigurationConforms(sample, plan, take) {
  return plan.activation === 'on_each_fill' && plan.exitPolicy === 'staged' && plan.activateOrders.length === 2 &&
    take?.quantity.basis === 'parent_filled_fraction' && take.quantity.numerator * 3 === take.quantity.denominator &&
    plan.afterExit === (sample.id === 'staged_each_keep' ? 'keep_entry_remainder' : 'cancel_entry_remainder');
}
export function stagedPartialExecutionConforms(sample, { final, snapshots }) {
  const entry = final.orders.find(o => o.side === 'buy'), take = final.orders.find(o => o.parentOrderId && o.kind === 'take_profit');
  const atTen = snapshots[4].book, atProfit = snapshots[6].book;
  if (atTen.orders.find(o => o.kind === 'take_profit')?.remainingQuantity !== '3' ||
    atProfit.orders.find(o => o.kind === 'stop_loss')?.remainingQuantity !== '7' ||
    atProfit.orders.find(o => o.kind === 'take_profit')?.filledQuantity !== '3') return false;
  if (sample.id === 'staged_each_cancel') return entry.state === 'cancelled' && entry.filledQuantity === '10' && take.filledQuantity === '3' && final.positions.length === 0;
  const atTwenty = snapshots[11].book, afterSix = snapshots[13].book;
  return atTwenty.orders.find(o => o.kind === 'take_profit')?.remainingQuantity === '3' &&
    atTwenty.orders.find(o => o.kind === 'stop_loss')?.remainingQuantity === '17' &&
    afterSix.orders.find(o => o.kind === 'take_profit')?.filledQuantity === '6' &&
    entry.state === 'filled' && entry.filledQuantity === '27' && take.filledQuantity === '9' && final.positions.length === 0;
}
