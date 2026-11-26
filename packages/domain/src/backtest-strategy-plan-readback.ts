import { marketTimezones } from './market-session.js';
import { expressionChildren } from './backtest-expression-children.js';
import { DecimalValue as D } from './decimal.js';
import { backtestDailyOrderLines } from './backtest-daily-order-display.js';
import type { BacktestStrategy, Expression } from './backtest-strategy.js';
import { backtestTradePlanLines } from './backtest-trade-plan-display.js';
import { activeBacktestTradePlan } from './backtest-trade-plan-contract.js';
import { tradePlanProtectionRules } from './backtest-trade-protection.js';
import { isPriceResearchStrategyDefinition } from './backtest-strategy-coordinate.js';

const percent = (value: string) => D.from(value).times('100').toString() + '%';
import { describeBacktestExpression as describe } from './backtest-expression-display.js';

function riskLines(risks: BacktestStrategy['risk']) {
  return risks.map((risk) => {
    if (risk.type === 'fixedStop')
      return `独立固定止损：含买入费用的持仓均价下方 ${percent(risk.percent)}，收盘判断、后续开盘清仓。`;
    if (risk.type === 'fixedTakeProfit')
      return `独立固定止盈：含买入费用的持仓均价上方 ${percent(risk.percent)}，收盘判断、后续开盘清仓。`;
    return `独立持有期退出：最多 ${risk.periods} 个周期。`;
  });
}

/** 完整配置回读；合法但选错的入场、货币金额或普通退出也必须直接可见。 */
export function backtestStrategyPlanReadback(
  strategy: Pick<BacktestStrategy, 'entry' | 'exit' | 'sizing' | 'risk' | 'tradePlan'> & {
    schemaVersion?: string;
    entryTrigger?: BacktestStrategy['entryTrigger'];
    signalSources?: readonly {
      id: string;
      priceCoordinate?: 'actual' | 'research' | 'run' | 'native-nav' | undefined;
      asset?: { symbol: string; market: string; assetType: string };
      timeframe?: string;
    }[];
    executionInstrument?: { assetType: string };
    execution?: BacktestStrategy['execution'];
    cost?: {
      commissionRate: string;
      slippageRate: string;
      minimumCommission?: { amount: string; currency: string } | undefined;
    };
    benchmark?: BacktestStrategy['benchmark'];
  },
  unit?: string,
): string[] {
  const sizing = strategy.sizing;
  const daily = strategy.execution?.timing === 'dailyBarOrders';
  const research = isPriceResearchStrategyDefinition(strategy);
  const sources = new Map(
    strategy.signalSources?.map((s) => {
      let label = '';
      if (s.priceCoordinate === 'actual') label = '实际';
      else if (s.priceCoordinate === 'research') label = '后复权';
      else if (s.priceCoordinate === 'run') label = '本次运行价格';
      else if (s.priceCoordinate === 'native-nav') label = '发布单位';
      if (s.asset)
        label += `（来源 ${s.id}：${s.asset.symbol}／${s.asset.market}／${s.timeframe ?? '未设置周期'}）的`;
      return [s.id, label] as const;
    }),
  );
  const timezones = new Map(strategy.signalSources?.flatMap((source) => {
    const market = source.asset?.market;
    return market === 'CN' || market === 'HK' || market === 'US'
      ? [[source.id, marketTimezones[market]] as const] : [];
  }));
  let allocation: string;
  if (sizing.type === 'percentOfEquity')
    allocation = `每次投入不超过${daily ? '委托时可见' : '执行前'}权益的 ${percent(sizing.percent)}，包含滑点与全部买入费用`;
  else if (sizing.type === 'fixedAmount') allocation = `每次投入货币金额 ${sizing.amount}`;
  else if (sizing.type === 'targetWeight') allocation = `目标权益仓位 ${percent(sizing.weight)}`;
  else if (strategy.execution?.mode === 'nav')
    allocation = `首次申购 ${sizing.quantity} 份实际基金份额，以发布的单位净值和冻结申赎规则确认`;
  else if (research)
    allocation = `以 ${sizing.quantity} ${strategy.executionInstrument?.assetType === 'stock' ? '股' : '份'}的操作时点原价确定投入金额，成交以研究单位记账`;
  else allocation = `首次买入 ${sizing.quantity} ${unit ?? '股'}`;
  const lines = [
    `入场条件：${describe(strategy.entry, sources, timezones)}。`,
    strategy.entryTrigger === 'rising-edge' ? '入场政策：条件由假转真时入场；持仓期间继续观测，缺值不重置边沿。'
      : strategy.entryTrigger === 'while-flat' ? '入场政策：条件成立且空仓、有可用资金、无冲突待执行入场委托时入场。'
        : `入场政策：旧定义保留${activeBacktestTradePlan(strategy.tradePlan) ? '交易计划的空仓入场' : '普通边沿入场'}行为。`,
    `普通退出条件：${describe(strategy.exit, sources, timezones)}。`,
    `普通仓位：${allocation}。${allocationReplacement(strategy.tradePlan)}`,
    ...riskLines(strategy.risk),
  ];
  lines.push(...backtestSessionReadback(strategy));
  if (strategy.execution?.timing === 'dailyBarOrders') lines.push(...backtestDailyOrderLines(strategy.execution, sources, timezones));
  else if (strategy.execution?.mode === 'exchange' && !activeBacktestTradePlan(strategy.tradePlan))
    lines.push('成交方式：收盘判断、下一可交易开盘市价成交，不保证信号价格成交。');
  if (strategy.execution?.mode === 'exchange' && strategy.execution.timing !== 'dailyBarOrders')
    lines.push('委托有效期：当日有效；市价委托按现有整笔撮合规则成交或拒绝。');
  if (strategy.execution?.mode === 'nav')
    lines.push(
      `申赎方式：${strategy.execution.requestTypes.map((type) => (type === 'subscribe' ? '申购' : '赎回')).join('、')}，使用下一可用发布单位净值；截止时点、确认周期和费用按冻结基金规则计算。`,
    );
  if (strategy.cost)
    lines.push(
      `模拟成本：佣金比例 ${percent(strategy.cost.commissionRate)}、滑点比例 ${percent(strategy.cost.slippageRate)}；其余适用市场费用按冻结执行规则计算。`,
    );
  if (strategy.cost?.minimumCommission)
    lines.push(
      `最低佣金：${strategy.cost.minimumCommission.amount} ${strategy.cost.minimumCommission.currency}。`,
    );
  if (strategy.benchmark)
    lines.push(`收益比较基准：${strategy.benchmark.symbol}；不作为下单标的。`);
  return [
    ...lines,
    ...backtestTradePlanLines(
      strategy.tradePlan,
      unit ?? (research ? '研究单位' : undefined),
      sources,
      daily,
      timezones,
    ),
  ];
}

function allocationReplacement(plan: BacktestStrategy['tradePlan']): string {
  if (plan?.volatilityTarget) return '已由每日目标波动率计划替代。';
  if (plan?.monthlyRebalance) return '已由月末目标仓位计划替代。';
  return '';
}

export function backtestSessionReadback(
  strategy: Pick<BacktestStrategy, 'entry' | 'exit' | 'tradePlan'>,
): string[] {
  const expressions = [
    strategy.entry,
    strategy.exit,
    ...tradePlanProtectionRules(strategy.tradePlan).map((rule) => rule.expression),
  ];
  if (!expressions.some(hasSessionValue)) return [];
  return [
    '会话统计按冻结交易日历和已完成且可见的盘中行情计算，按交易日重置、午休不重置；累计均价缺量、缺根或累计量为零时不发信号。时间条件限制收盘判断，成交使用严格晚于信号的可交易开盘，可能在该时间范围之外。',
  ];
}

function hasSessionValue(node: Expression): boolean {
  if (node.type === 'sessionValue') return true;
  return expressionChildren(node).some(hasSessionValue);
}
