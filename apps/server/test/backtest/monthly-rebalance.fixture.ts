import {
  fixedAuthoringPlan,
  planAuthoringContent,
} from './trade-plan-authoring-content.fixture.js';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import { DecimalValue as D } from '@thesis-ledger/domain';
import { constantEquality, entryAllowed } from './volatility-target.fixture.js';
import { planContainsOnlyControls } from './trade-plan-model-controls.fixture.js';

/** 独立模拟数据，不读取历史比赛或真实行情；工作日只是此夹具声明的日历输入。 */
export const monthlyScenario = (() => {
  const dates: string[] = [];
  const closes: number[] = [];
  for (
    const cursor = new Date('2026-04-01T00:00:00Z');
    cursor <= new Date('2026-09-02T00:00:00Z');
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    if (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) continue;
    const date = cursor.toISOString().slice(0, 10);
    let price = 10;
    if (date >= '2026-06-15') price = 20;
    if (date >= '2026-07-15') price = 5;
    if (date >= '2026-08-15') price = 5.05;
    dates.push(date);
    closes.push(price);
  }
  return { dates, closes };
})();

export const monthlyCases = [false, true].map((enabled) => ({
  id: enabled ? 'month-end-rebalance' : 'initial-allocation',
  intent:
    '单标的日线，不设置价格或指标入场门槛，普通退出始终不触发。' +
    (enabled
      ? '每月最后一个交易日收盘，把仓位调整为账户权益的30%；与目标偏离不足3个百分点则不交易，达到3个百分点就调整，在下一个可交易开盘执行。空仓也只在月末首次买入，其他日期不调仓。'
      : '空仓时投入权益的30%买入，持有后不再主动调仓，不在月末重新调整。') +
    '不添加止损、止盈、冷却、暂停、波动率或分批规则。',
}));

export function monthlyContent(enabled: boolean) {
  const content = planAuthoringContent(false);
  content.description = monthlyCases[Number(enabled)]!.intent;
  content.requirements = [
    {
      id: 'rules',
      quote: content.description,
      interpretation: content.description,
      state: 'understood',
      definitionPaths: [],
    },
  ];
  content.confirmation!.sizing = { type: 'percentOfEquity', percent: '0.3' };
  content.confirmation!.entrySummary =
    '空仓允许开仓；普通投入权益的30%，月末主动调仓计划存在时由计划替代。';
  content.confirmation!.exitSummary = '普通退出始终不触发，不添加额外退出或风险规则。';
  return content;
}

export function fixedMonthlyPlan(enabled: boolean) {
  return {
    ...fixedAuthoringPlan(false),
    sizing: { type: 'percentOfEquity' as const, percent: '0.3' },
    tradePlan: {
      version: 1 as const,
      evaluation: 'barClose' as const,
      stages: [],
      ...(enabled
        ? {
            monthlyRebalance: {
              targetEquityFraction: '0.3',
              deviationThreshold: '0.03',
              evaluation: 'lastTradingDayClose' as const,
            },
          }
        : {}),
    },
  };
}

export function monthlyPlanConforms(id: string, strategy: BacktestStrategy): boolean {
  const plan = strategy.tradePlan;
  if (strategy.risk.length || !planContainsOnlyControls(plan, ['monthlyRebalance'])) return false;
  if (!entryAllowed(strategy.entry) || constantEquality(strategy.exit) !== false) return false;
  const monthly = plan?.monthlyRebalance;
  if (id === 'initial-allocation')
    return (
      !monthly &&
      strategy.sizing.type === 'percentOfEquity' &&
      D.from(strategy.sizing.percent).compareTo('0.3') === 0
    );
  return Boolean(
    monthly &&
    D.from(monthly.targetEquityFraction).compareTo('0.3') === 0 &&
    D.from(monthly.deviationThreshold).compareTo('0.03') === 0 &&
    monthly.evaluation === 'lastTradingDayClose',
  );
}

export function monthlyExecutionConforms(
  id: string,
  fills: readonly { side: string; quantity: string; occurredAt: string }[],
): boolean {
  if (id === 'initial-allocation') return fills.length === 1 && fills[0]?.side === 'buy';
  // 此夹具五月建仓、六月上涨后减仓、七月下跌后补仓，八月小幅偏离跳过。
  return (
    fills.length === 3 &&
    fills.map((fill) => fill.side).join(',') === 'buy,sell,buy' &&
    fills.map((fill) => fill.occurredAt.slice(0, 10)).join(',') ===
      '2026-06-01,2026-07-01,2026-08-03' &&
    fills.every((fill) => D.from(fill.quantity).isPositive())
  );
}
