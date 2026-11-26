import type { BacktestDailyMatching } from './backtest-order-contract.js';

/** 固定已确认的撮合顺序，额度由本次运行明确填写。 */
export function dailyBacktestMatchingPolicy(liquidity: BacktestDailyMatching['liquidity']): BacktestDailyMatching {
  return { conflict: 'stopFirst', childActivation: 'openSameBarRangeNextBar', partialExit: 'protectRemaining', liquidity: { ...liquidity } };
}
export function backtestDailyMatchingLines(policy: BacktestDailyMatching, unit: string) {
  if (policy.liquidity.kind === 'wholeOrder') return [
    '整笔成交模拟。价格达到条件且整单可付或可售时成交，暂不能整笔成交时等候至下次撮合或到期。',
    '建仓成交后保护。开盘成交可参与同根后续区间，区间成交从下一根开盘参与。同组双触时止损优先。',
  ];
  return [
    policy.liquidity.kind === 'perBarCap' ? `成交能力压力测试。每账户、标的、根最多模拟成交 ${policy.liquidity.quantity} ${unit}，开盘／区间及全部买卖委托共用。` : `本次不设模拟成交额度上限；数量单位为${unit}，仍受资金、持仓及交易单位约束。`,
    '先处理已知开盘成交；区间内同组双触止损优先。开盘父成交的保护可参与同根后续区间，区间父成交的保护从下一根开盘参与。',
    '部分止盈缩减余下保护；止损触发取消对应止盈余量和本轮待买单，已触发市价余量继续等待。',
  ];
}
