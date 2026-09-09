import { Injectable } from '@nestjs/common';
import {
  aggregateMinuteBars,
  directDailyBars,
  type DerivedBacktestBar,
  type BacktestMinuteBar,
} from '@thesis-ledger/domain';
import {
  backtestMinuteBarSchema,
  backtestDailyBarSchema,
  type BacktestDailyBar,
  type BacktestCapabilities,
  type DataCapability,
} from '@thesis-ledger/schemas';

const derivedTimeframes = ['5m', '15m', '30m', '60m'] as const;

export const composeEffectiveBacktestCapabilities = (
  input: BacktestCapabilities,
): BacktestCapabilities => {
  const baseCapabilities = input.capabilities.filter((capability) => capability.kind !== 'derived');
  const derivedCapabilities: DataCapability[] = [];
  for (const base of baseCapabilities) {
    if (base.instrumentType === 'NAV_FUND' || base.timeframe !== '1m') continue;
    for (const timeframe of derivedTimeframes) {
      const hasCalendar = input.calendars.some(
        (calendar) => calendar.market === base.market,
      );
      const status =
        base.status === 'supported' && !hasCalendar
          ? 'unavailable'
          : base.status;
      const reason =
        status === 'supported'
          ? '由 Server 从冻结 1m Bar 按市场 Session 确定性派生'
          : (base.reason ??
            (base.status === 'supported' && !hasCalendar
              ? `${base.market} Calendar fact unavailable`
              : `基础 1m capability 为 ${status}`));
      derivedCapabilities.push({
        ...base,
        timeframe,
        kind: 'derived',
        status,
        provider: 'thesis-ledger-server',
        providerRevision: 'server-aggregation-v2',
        reason,
      });
    }
  }
  return { ...input, capabilities: [...baseCapabilities, ...derivedCapabilities] };
};

@Injectable()
export class BacktestBarAggregationService {
  aggregate(input: {
    timeframe: '1m' | '1d' | '5m' | '15m' | '30m' | '60m';
    bars: readonly unknown[];
  }): BacktestDailyBar[] | BacktestMinuteBar[] | DerivedBacktestBar[] {
    if (input.timeframe === '1d') {
      return directDailyBars(
        input.bars.map((bar) => backtestDailyBarSchema.parse(bar)),
      ) as BacktestDailyBar[];
    }
    if (input.timeframe === '1m') {
      return input.bars.map((bar) =>
        backtestMinuteBarSchema.parse(bar),
      ) as BacktestMinuteBar[];
    }
    const bars = input.bars.map((bar) => backtestMinuteBarSchema.parse(bar)) as BacktestMinuteBar[];
    return aggregateMinuteBars(bars, input.timeframe);
  }
}
