import { DecimalValue as D } from '@thesis-ledger/domain';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import {
  fixedAuthoringPlan,
  planAuthoringContent,
} from './trade-plan-authoring-content.fixture.js';

export const lossPauseScenario = {
  dates: [
    '2026-05-18',
    '2026-05-19',
    '2026-05-20',
    '2026-05-21',
    '2026-05-22',
    '2026-05-25',
    '2026-05-26',
    '2026-05-27',
    '2026-05-28',
    '2026-05-29',
    '2026-06-01',
    '2026-06-02',
    '2026-06-03',
    '2026-06-04',
    '2026-06-05',
    '2026-06-08',
    '2026-06-09',
    '2026-06-10',
    '2026-06-11',
    '2026-06-12',
    '2026-06-15',
    '2026-06-16',
    '2026-06-17',
    '2026-06-18',
    '2026-06-19',
    '2026-06-22',
    '2026-06-23',
    '2026-06-24',
    '2026-06-25',
    '2026-06-26',
    '2026-06-29',
    '2026-06-30',
  ],
  closes: Array<number>(32).fill(10),
};
const lossIntent =
  '只在最近三笔完整平仓交易全部净亏损后，暂停随后十个完整交易日的新开仓，第十一个交易日重新检查。净收益扣除买卖费用，现金分配单独记账，不影响亏损判定；部分卖出不记一笔，零收益不算亏损。旧亏损窗口不得重复启动暂停。';
const barIntent =
  '每次完整平仓后都等待十根完整的日线行情，再重新检查开仓；不根据交易盈亏启动暂停。';
export const lossPauseCases = [false, true].map((loss) => ({
  id: loss ? 'loss-window' : 'bar-cooldown',
  intent:
    '使用每日收盘判断。空仓且允许开仓时投入权益的20%买入；持仓时在下一次收盘决定全部退出，在下个可交易开盘成交。' +
    (loss ? lossIntent : barIntent) +
    '不要添加止损、止盈、移动保护、分批或其他退出条件。',
}));

export function lossPauseContent(loss: boolean) {
  const content = planAuthoringContent(false);
  const description = lossPauseCases[Number(loss)]!.intent;
  content.description = description;
  content.requirements = [
    {
      id: 'rules',
      quote: description,
      interpretation: description,
      state: 'understood',
      definitionPaths: [],
    },
  ];
  content.confirmation!.exitSummary =
    '持仓时在下一次收盘决定全部退出，在下个可交易开盘成交。' + (loss ? lossIntent : barIntent);
  return content;
}

export function fixedLossPausePlan(loss: boolean): BacktestStrategy {
  const strategy = fixedAuthoringPlan(false);
  strategy.name = '独立亏损暂停样本';
  strategy.exit = { type: 'positionState', field: 'isOpen' };
  strategy.tradePlan = {
    version: 1,
    evaluation: 'barClose',
    stages: [],
    ...(loss
      ? { lossPause: { completedTrades: 3, tradingDays: 10, pnlBasis: 'fillsNetOfFees' as const } }
      : { cooldown: { bars: 10, stopBars: 10 } }),
  };
  return strategy;
}

export function lossPausePlanConforms(id: string, strategy: BacktestStrategy) {
  const plan = strategy.tradePlan;
  if (
    !plan ||
    plan.initialStop ||
    plan.trailing ||
    plan.riskBudget ||
    plan.monthlyRebalance ||
    plan.volatilityTarget ||
    plan.stages.length ||
    strategy.risk.length ||
    !entryExitConforms(strategy)
  )
    return false;
  if (
    strategy.sizing.type !== 'percentOfEquity' ||
    D.from(strategy.sizing.percent).compareTo('0.2') !== 0
  )
    return false;
  if (id === 'loss-window')
    return (
      !plan.cooldown &&
      plan.lossPause?.completedTrades === 3 &&
      plan.lossPause.tradingDays === 10 &&
      plan.lossPause.pnlBasis === 'fillsNetOfFees'
    );
  return !plan.lossPause && plan.cooldown?.bars === 10;
}

function entryExitConforms(strategy: BacktestStrategy) {
  return (
    strategy.entry.type === 'not' &&
    strategy.entry.expression.type === 'positionState' &&
    strategy.entry.expression.field === 'isOpen' &&
    strategy.exit.type === 'positionState' &&
    strategy.exit.field === 'isOpen'
  );
}

export function lossPauseExecutionConforms(
  id: string,
  fills: readonly { side: string; occurredAt: string }[],
) {
  const expected = id === 'loss-window' ? [1, 3, 5, 18, 31] : [1, 13, 25];
  const buys = fills
    .filter((fill) => fill.side === 'buy')
    .map((fill) => fill.occurredAt.slice(0, 10));
  return JSON.stringify(buys) === JSON.stringify(expected.map((n) => lossPauseScenario.dates[n]));
}
