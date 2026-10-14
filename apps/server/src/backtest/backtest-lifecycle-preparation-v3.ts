import {
  backtestLifecyclePreparationV3Schema,
  lifecycleWarmupPolicyV3,
  type BacktestLifecyclePreparationV3,
  type MarketTradingStatusResponseV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';
import { hashCanonicalManifest } from './backtest-snapshot.js';

/** 只对影响准备的来源输入寻址；请求追踪号与每次读取的包装时钟不改变事实身份。 */
export function lifecycleInputHashV3(response: MarketTradingStatusResponseV3) {
  const provenance = { ...response.provenance, fetchedAt: undefined };
  return hashCanonicalManifest({
    symbol: response.symbol,
    range: response.range,
    routeKey: response.routeKey,
    routeTarget: response.routeTarget,
    basicLifecycle: response.basicLifecycle,
    days: response.days,
    sourceRecords: response.sourceRecords,
    sourceDocuments: response.sourceDocuments,
    structuredCoverage: response.structuredCoverage,
    provenance,
  });
}
export function lifecycleEligibleDateV3(date: string, response: MarketTradingStatusResponseV3) {
  const basic = response.basicLifecycle;
  return (
    !(basic?.ipoDate && date < basic.ipoDate) &&
    !(basic?.outDate && date >= basic.outDate) &&
    response.days.find((day) => day.date === date)?.state !== 'suspended'
  );
}
export function deriveLifecyclePreparationV3(input: {
  response: MarketTradingStatusResponseV3;
  bars: readonly { timestamp: string }[];
  start: string;
  end: string;
  required: number;
  priceResponseHash: string;
}): BacktestLifecyclePreparationV3 {
  const { response, start, end, required } = input;
  if (!response.basicLifecycle) throw new Error('生命周期来源未提供基础日期，不能选择新研究协议');
  const dates = input.bars
    .map((bar) => bar.timestamp.slice(0, 10))
    .filter((date) => lifecycleEligibleDateV3(date, response));
  if (
    new Set(dates).size !== dates.length ||
    dates.some((date, i) => i > 0 && date <= dates[i - 1]!)
  )
    throw new Error('生命周期预热实际Bar日期重复或乱序');
  const before = dates.filter((date) => date < start).length;
  let signalStartDate = start;
  if (
    before < required ||
    (response.basicLifecycle.ipoDate && start < response.basicLifecycle.ipoDate)
  ) {
    if (response.basicLifecycle.ipoDateStatus !== 'known')
      throw new Error('上市日未知且原起点前实际预热不足，不推断上市日');
    if (response.range.start >= response.basicLifecycle.ipoDate!)
      throw new Error('生命周期范围内真实预热不足，不能把来源缺失当作上市前无行情');
    const candidate = dates.find(
      (date, index) => date >= start && date <= end && index >= required,
    );
    if (!candidate) throw new Error('生命周期窗口内真实行情始终不足原策略预热需求或没有信号日');
    signalStartDate = candidate;
  }
  if (!dates.some((date) => date >= signalStartDate && date <= end))
    throw new Error('生命周期窗口内没有可计算信号的真实行情');
  return backtestLifecyclePreparationV3Schema.parse({
    version: lifecycleWarmupPolicyV3,
    response,
    inputHash: lifecycleInputHashV3(response),
    priceResponseHash: input.priceResponseHash,
    requiredWarmupBars: required,
    signalStartDate,
  });
}
export function assertLifecyclePreparationV3(
  config: RunConfigV3,
  bars: readonly { timestamp: string }[],
  required: number,
  current?: MarketTradingStatusResponseV3,
) {
  const frozen = config.lifecyclePreparation;
  if (!frozen) return;
  if (current && lifecycleInputHashV3(current) !== frozen.inputHash)
    throw new Error('生命周期准备输入变化，请重新准备');
  const derived = deriveLifecyclePreparationV3({
    response: frozen.response,
    bars,
    start: config.startDate,
    end: config.endDate,
    required,
    priceResponseHash: config.frozenExecutionWindow!.responseHash,
  });
  if (hashCanonicalManifest(derived) !== hashCanonicalManifest(frozen))
    throw new Error('生命周期准备与实际价格、预热或信号起点不一致');
}
