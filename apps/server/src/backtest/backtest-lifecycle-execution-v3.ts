import type { RunConfigV3 } from '@thesis-ledger/schemas';
import { lifecycleEligibleDateV3 } from './backtest-lifecycle-preparation-v3.js';

export function lifecycleSignalDateV3(config: RunConfigV3, date: string) {
  const life = config.lifecyclePreparation;
  return !life || (date >= life.signalStartDate && lifecycleEligibleDateV3(date, life.response));
}
export function lifecycleWarmupRowV3(config: RunConfigV3, row: Readonly<Record<string, unknown>>) {
  return (
    !config.lifecyclePreparation ||
    (typeof row.occurredAt === 'string' &&
      lifecycleEligibleDateV3(row.occurredAt.slice(0, 10), config.lifecyclePreparation.response))
  );
}
export function lifecycleBenchmarkSkippedDatesV3(config: RunConfigV3) {
  const life = config.lifecyclePreparation;
  return life
    ? life.response.days
        .filter((day) => !lifecycleSignalDateV3(config, day.date))
        .map((day) => day.date)
    : [];
}
export function lifecycleExecutionWarningsV3(config: RunConfigV3) {
  const life = config.lifecyclePreparation;
  if (!life) return [];
  const outside = life.response.days.filter((day) => {
    const basic = life.response.basicLifecycle!;
    return (
      (basic.ipoDate && day.date < basic.ipoDate) || (basic.outDate && day.date >= basic.outDate)
    );
  }).length;
  return [
    `生命周期预热协议 ${life.version}：请求区间 ${config.startDate}～${config.endDate} 保持，实际信号起点 ${life.signalStartDate}，原需 ${life.requiredWarmupBars} 个真实预热Bar；策略与基准使用该可比较起点。生命周期范围外 ${outside} 日，不作为停牌或来源缺失；已知停牌不积累预热，未知与无Bar仍按已选研究语义披露。上市特殊规则、最后交易日与摘牌后价值未由基础日期证明。`,
  ];
}
