import { DecimalValue as D } from './decimal.js';
import type { TradePlanMonthlyConfig } from './backtest-trade-monthly-action.js';

export function monthlyRebalanceLines(config: TradePlanMonthlyConfig | undefined): string[] {
  if (!config) return [];
  const target = D.from(config.targetEquityFraction).times('100').toString();
  const threshold = D.from(config.deviationThreshold).times('100').toString();
  return [
    `月末调仓：只在冻结交易日历确认的每月最后交易日完成收盘后，将目标仓位设为权益的 ${target}%；实际持仓权重与目标的绝对偏离达到 ${threshold} 个百分点时才调整，低于该值跳过。每月只判断一次，不按自然月末推测；日历不可见或覆盖不足时不调仓。`,
    '收盘冻结目标差额，随后首个可交易开盘按资金、手数与可售持仓执行。已有持仓加本次买入的费用和滑点支出受目标比例约束，超额只缩量，低开不放大委托；被动价格变化仍可能造成权重偏差。拒单不算成交，当月不重复补做。',
    '月末目标替代普通首次入场仓位；非月末不以普通投入兜底。空仓仍须满足入场、冷却与暂停条件；风险保护和普通退出先于月末调仓。增仓不重置首次入场锚点。仅日线，不能与每日波动率、按止损距离定仓或一次性分批计划组合。',
  ];
}

export const MONTHLY_REBALANCE_PROMPT =
  'monthlyRebalance日线冻结末交易日收盘每月一次：偏离>=阈值调权益目标，2个百分点="0.02"；替代仓位/后开盘，守入场暂停，非月末不兜底/拒单不补；与波动率/风险预算/阶段互斥，每日目标unsupported，固定投入省略。';
