import {
  fixedAuthoringPlan,
  planAuthoringContent,
} from './trade-plan-authoring-content.fixture.js';
import { fixedSessionPlan, sessionVwapSnapshot } from './session-vwap-snapshot.fixture.js';
import { sessionVwapCases, sessionVwapContent } from './session-vwap-model.fixture.js';
import { tradePlanSnapshot } from './trade-plan-snapshot.fixture.js';
import {
  protectionCases,
  protectionContent,
  fixedProtectionPlan,
  type ProtectionFeature,
} from './protection-model.fixture.js';
import { protectionSnapshot } from './protection-snapshot.fixture.js';
import type { BacktestStrategy, AuthoringModificationTarget } from '@thesis-ledger/schemas';
import {
  fixedLossPausePlan,
  lossPauseContent,
  lossPauseCases,
  lossPauseScenario,
} from './loss-pause-model.fixture.js';
import {
  fixedVolatilityPlan,
  volatilityContent,
  volatilityCases,
  volatilityScenario,
} from './volatility-target.fixture.js';
import {
  fixedMonthlyPlan,
  monthlyContent,
  monthlyCases,
  monthlyScenario,
} from './monthly-rebalance.fixture.js';

/** 仅选择隔离验收样本；实际消息、保存、执行入口保持生产实现。 */
export function tradePlanModelScenario(confirmedCost?: BacktestStrategy['cost']) {
  const feature = process.env.BACKTEST_PLAN_SCENARIO;
  if (feature === 'atr-protection' || feature === 'condition-protection')
    return {
      cases: protectionCases(feature, confirmedCost),
      scenario: undefined,
      content: (enabled: boolean) => protectionContent(feature, enabled),
      configuration: (enabled: boolean) => fixedProtectionPlan(feature, enabled),
      modificationIntent: (enabled: boolean) =>
        '只把保护规则改成：' +
        protectionCases(feature)[Number(enabled)]!.intent +
        '标的、来源、入场、普通退出、普通仓位、风险、费用及元数据保持原值。',
    };
  if (process.env.BACKTEST_PLAN_SCENARIO === 'session-vwap')
    return {
      cases: sessionVwapCases,
      scenario: undefined,
      content: sessionVwapContent,
      configuration: fixedSessionPlan,
      modificationIntent: (cumulative: boolean) =>
        '仅将入场判断的均价改成' +
        (cumulative
          ? '当日首个开市以来按收盘价乘成交量累计的均价，按交易日重置'
          : '最近20根已完成一分钟行情按收盘价乘成交量加权的滚动均价') +
        '；首小时和第31分钟限制、普通退出及其他所有字段保持原值。',
    };
  if (process.env.BACKTEST_PLAN_SCENARIO === 'monthly-rebalance')
    return {
      cases: monthlyCases,
      scenario: monthlyScenario,
      content: monthlyContent,
      configuration: fixedMonthlyPlan,
      modificationIntent: (enabled: boolean) =>
        enabled
          ? '改成只在冻结交易日历确认的每月最后交易日完成收盘后，把仓位调回权益30%，绝对偏离不足3个百分点跳过，达到时才调整，下一可交易开盘执行。空仓也只在月末建仓，每月只判断一次，未知日历不猜测，拒单当月不补做；普通投入比例和其他规则全部不变。'
          : '取消月末主动调仓，恢复空仓时投入权益30%，买入后不再主动调仓。其他规则全部不变。',
    };
  if (process.env.BACKTEST_PLAN_SCENARIO === 'volatility-target')
    return {
      cases: volatilityCases,
      scenario: volatilityScenario,
      content: volatilityContent,
      configuration: fixedVolatilityPlan,
      modificationIntent: (enabled: boolean) =>
        enabled
          ? '把固定投入权益50%改成每日收盘按过去二十个简单日收益的样本标准差乘根号252年化，将仓位调到10%除以年化波动率，上限50%，持仓期间每天主动增减。需21个有效收盘，样本不足或零波动不新增投入、不强制清仓。普通投入比例和其他规则保持原值。'
          : '取消按波动率每日主动调仓，恢复空仓时固定投入权益50%，持仓期间不主动增减仓。其他规则全部不变。',
    };
  if (process.env.BACKTEST_PLAN_SCENARIO === 'loss-pause')
    return {
      cases: lossPauseCases,
      scenario: lossPauseScenario,
      content: lossPauseContent,
      configuration: fixedLossPausePlan,
      modificationIntent: (enabled: boolean) =>
        enabled
          ? '把每次平仓后等待十根日线，改成只在最近三笔完整平仓交易全部净亏损后，暂停随后十个完整交易日，第十一个交易日重新检查。扣除买卖费用，现金分配单独记账，不影响亏损判定。其他规则全部不变。'
          : '取消按连续净亏损交易暂停，改为每次完整平仓后等待十根完整日线行情，再检查入场。其他规则全部不变。',
    };
  return {
    cases: null,
    scenario: undefined,
    content: planAuthoringContent,
    configuration: fixedAuthoringPlan,
    modificationIntent: (enabled: boolean) =>
      enabled
        ? '初始保护仍在最初买入成交价下方5%，改为盈利达到10%后跟随最高收盘价下方5%上移，永不下移。其他规则全部不变。'
        : '取消跟随最高收盘价的保护，改为固定在最初买入成交价下方5%，上涨也不移动。其他规则全部不变。',
  };
}

export function modelScenarioSnapshot(root: string, strategy: BacktestStrategy) {
  const feature = process.env.BACKTEST_PLAN_SCENARIO as ProtectionFeature | undefined;
  if (feature === 'atr-protection' || feature === 'condition-protection')
    return protectionSnapshot(
      root,
      feature === 'atr-protection' ? 'current-atr' : 'armed-stop',
      strategy,
    );
  return process.env.BACKTEST_PLAN_SCENARIO === 'session-vwap'
    ? sessionVwapSnapshot(root, strategy)
    : tradePlanSnapshot(root, strategy, tradePlanModelScenario().scenario);
}
export function modelScenarioModificationTarget(): AuthoringModificationTarget {
  return process.env.BACKTEST_PLAN_SCENARIO === 'session-vwap' ? 'entry' : 'tradePlan';
}
