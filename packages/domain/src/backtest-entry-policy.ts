import type { BacktestStrategy } from './backtest-strategy.js';
import { activeBacktestTradePlan } from './backtest-trade-plan-contract.js';
import type { BacktestTradePlan } from './backtest-trade-plan-contract.js';

/** 旧定义的新版本先保存原政策，之后修改保护不重新推断政策。 */
export function materializeEntryPolicy<T extends Pick<BacktestStrategy, 'entryTrigger'> & { tradePlan?: BacktestTradePlan | undefined }>(strategy: T): T & { entryTrigger: 'rising-edge' | 'while-flat' } {
  return { ...strategy, entryTrigger: strategy.entryTrigger ?? (activeBacktestTradePlan(strategy.tradePlan) ? 'while-flat' : 'rising-edge') };
}
