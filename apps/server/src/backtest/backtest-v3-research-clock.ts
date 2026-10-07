import {
  isAvailableForDecisionAt,
  type BacktestResearchClock,
  type TradingCalendar,
} from '@thesis-ledger/domain';
import type { RunConfigV3 } from '@thesis-ledger/schemas';
import { dailyBarSessionWindow } from './backtest-daily-bar-session.js';

/** Attaches a separate research clock without modifying the source observation. */
export const barResearchClocksV3 = (
  row: Readonly<Record<string, unknown>>,
  calendar: TradingCalendar,
  runConfig?: RunConfigV3,
): { researchClock?: BacktestResearchClock; openResearchClock?: BacktestResearchClock } => {
  if (runConfig?.executionPriceProtocol.history.basis !== 'fixed-provider-snapshot') return {};
  if (row.timeframe !== '1d' || typeof row.availableAt !== 'string') {
    throw new Error('DATA_UNAVAILABLE: V3 研究时钟需要完整日线及真实观测时间');
  }
  const session = dailyBarSessionWindow(row, calendar);
  const researchClock: BacktestResearchClock = {
    basis: 'fixed-provider-snapshot',
    dataAsOf: runConfig.dataAsOf,
    decisionAt: session.closedAt,
  };
  if (
    !isAvailableForDecisionAt({ availableAt: row.availableAt, researchClock }, runConfig.dataAsOf)
  ) {
    throw new Error('DATA_UNAVAILABLE: V3 研究行情晚于冻结截点或尚未收盘');
  }
  return { researchClock, openResearchClock: { ...researchClock, decisionAt: session.openedAt } };
};
