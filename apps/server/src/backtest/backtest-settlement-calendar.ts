import type { TradingCalendar } from '@thesis-ledger/domain';
import type { RunConfigV3 } from '@thesis-ledger/schemas';
import type { DependencyRequest, SnapshotDependencyV3Input } from './backtest-snapshot-v3-dependencies.js';

export type SettlementCalendarPolicy = 'settlement-calendar-v1';
export function parseSettlementCalendarPolicy(value: unknown): SettlementCalendarPolicy | undefined {
  if (value === undefined) return undefined;
  if (value !== 'settlement-calendar-v1') throw new Error('未知结算日历冻结策略');
  return value;
}

export function calendarDependencyRequests(
  input: SnapshotDependencyV3Input,
  invalid: (message: string) => never,
): DependencyRequest[] {
  const base = { start: input.plan.warmup.startDate, end: input.runConfig.endDate };
  const datasets = input.plan.datasets.filter((dataset) => dataset.purpose === 'calendar');
  const markets = [...new Set(datasets.map((dataset) => dataset.instrument))].sort();
  if (JSON.stringify(markets) !== JSON.stringify([...input.plan.calendarMarkets].sort())) {
    invalid('Snapshot V3 Calendar 数据集与依赖计划市场不一致。');
  }
  const policy = parseSettlementCalendarPolicy(input.settlementCalendarPolicy);
  const range = { ...base, end: policy ? settlementCalendarRequirement(input.runConfig).requestedEnd : base.end };
  return datasets.map((dataset) => {
    if (dataset.range.startDate !== base.start || dataset.range.endDate !== base.end) {
      invalid(`Snapshot V3 Calendar 请求范围无效: ${dataset.instrument}`);
    }
    const market = dataset.instrument;
    if (market !== 'CN' && market !== 'HK' && market !== 'US') {
      return invalid(`Snapshot V3 Calendar 市场无效: ${market}`);
    }
    return { purpose: 'calendar', identity: market, key: `calendar/${market}.parquet`, range,
      request: { market, ...range, dataAsOf: input.runConfig.dataAsOf } };
  });
}

/** 仅用于显式采用新结算覆盖策略的快照；旧快照不隐式升级。 */
export function settlementCalendarRequirement(config: RunConfigV3) {
  const model = config.executionModel;
  if (!model) throw new Error('结算日历需求缺少冻结执行模型');
  const segments = model.segments.filter(
    ({ range }) => range.start <= config.endDate && range.end >= config.startDate,
  );
  if (segments.length === 0) throw new Error('结算日历需求没有适用模型段');
  let tradingDays = 0;
  for (const { execution } of segments) {
    if (execution.mode !== 'exchange') throw new Error('当前完整快照结算日历仅支持交易所模式');
    tradingDays = Math.max(
      tradingDays,
      execution.sellableAfterTradingDays,
      execution.saleReinvestableAfterTradingDays,
    );
  }
  // 候选请求范围有界；节假日是否覆盖仍须由实际冻结日历证明。
  const bufferDays = tradingDays === 0 ? 0 : tradingDays * 3 + 14;
  const end = new Date(`${config.endDate}T12:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + bufferDays);
  return {
    policy: 'settlement-calendar-v1' as const,
    tradingDays,
    requestedEnd: end.toISOString().slice(0, 10),
  };
}

export function assertSettlementCalendarCoverage(
  calendar: TradingCalendar,
  lastPossibleFillDate: string,
  requirement: ReturnType<typeof settlementCalendarRequirement>,
): void {
  if (requirement.tradingDays === 0) return;
  const cursor = new Date(`${lastPossibleFillDate}T12:00:00.000Z`);
  const end = new Date(`${requirement.requestedEnd}T12:00:00.000Z`);
  let remaining = requirement.tradingDays;
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const status = calendar.status(cursor);
    if (status.reason === 'calendar-unavailable') throw new Error('结算日历覆盖未知');
    if (status.open) remaining -= 1;
    if (remaining === 0) return;
  }
  throw new Error('冻结日历不足以覆盖模型要求的后续结算交易日');
}
