import { DecimalValue } from '@thesis-ledger/domain';
import type { BacktestNavRunConfigV3, BacktestStrategy } from '@thesis-ledger/schemas';
import { collectEventTypes } from './backtest-dependency-events.js';
import { collectUsedSignalSources } from './backtest-dependency-price.js';
import { navPlanUnavailable } from './backtest-nav-planning-calendar.js';

export const assertSupportedNavStrategy = (
  strategy: BacktestStrategy,
  config: BacktestNavRunConfigV3,
) => {
  const instrument = strategy.executionInstrument;
  if (
    instrument.market !== 'CN' ||
    instrument.assetType !== 'fund' ||
    instrument.symbol !== config.navInput.symbol ||
    strategy.primaryTimeframe !== '1d' ||
    strategy.execution.mode !== 'nav' ||
    config.valuationPolicy.baseTimezone !== 'Asia/Shanghai'
  ) {
    navPlanUnavailable('NAV 计划仅支持同标的 CN/CNY 日频净值执行');
  }
  const benchmark = strategy.benchmark ?? instrument;
  if (
    benchmark.symbol !== instrument.symbol ||
    benchmark.market !== 'CN' ||
    benchmark.assetType !== 'fund'
  ) {
    navPlanUnavailable('NAV 首个冻结合同仅支持同基金基准');
  }
  if (collectEventTypes(strategy).length > 0) navPlanUnavailable('NAV 事件信号冻结尚未接入');
  if (
    !DecimalValue.from(strategy.cost.commissionRate).isZero() ||
    !DecimalValue.from(strategy.cost.slippageRate).isZero()
  ) {
    navPlanUnavailable('NAV 费用必须来自显式申赎模型，不能叠加旧策略费用');
  }
  const sources = collectUsedSignalSources(strategy);
  for (const source of sources) {
    if (
      source.asset.symbol !== instrument.symbol ||
      source.asset.market !== 'CN' ||
      source.asset.assetType !== 'fund' ||
      source.timeframe !== '1d' ||
      source.fields.some((field) => field !== 'nav')
    ) {
      navPlanUnavailable(`NAV 信号 ${source.id} 的标的、周期或字段尚未支持`);
    }
  }
  return sources;
};

export const navConfirmationBudget = (config: BacktestNavRunConfigV3) => {
  let confirmation = 0;
  let afterConfirmation = 0;
  for (const segment of config.executionModel.segments) {
    if (segment.execution.mode !== 'nav') navPlanUnavailable('NAV 模型包含场内执行段');
    confirmation = Math.max(confirmation, segment.execution.confirmationAfterTradingDays);
    afterConfirmation = Math.max(
      afterConfirmation,
      segment.execution.sellableAfterConfirmationTradingDays,
      segment.execution.redemptionReinvestableAfterConfirmationTradingDays,
    );
  }
  return { confirmation, afterConfirmation, tailTradingDays: 1 + confirmation + afterConfirmation };
};
