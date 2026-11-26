import type { BacktestExecutionModelV3 } from './backtest-execution-model.js';
import type { BacktestDailyMatching } from './backtest-daily-orders.js';

/** 异价属于未来成交事实；准备只按已选择的静态执行组合判断。 */
export function executionCombinationIssues(input: {
  accountingBasis: 'raw-events' | 'normalized-series';
  dailyOrders: boolean;
  matching?: BacktestDailyMatching | undefined;
  model?: BacktestExecutionModelV3 | undefined;
  startDate: string;
  endDate: string;
}) {
  if (input.accountingBasis !== 'raw-events' || !input.dailyOrders ||
      input.matching?.liquidity.kind !== 'perBarCap') return [];
  return (input.model?.segments ?? []).flatMap((segment, index) => {
    if (segment.range.end < input.startDate || segment.range.start > input.endDate ||
        segment.fees?.brokerCommission?.basis.kind !== 'actualShares') return [];
    return [{ code: 'PARTIAL_ACTUAL_SHARE_FEES_UNSUPPORTED' as const,
      path: ['executionModel', 'segments', index, 'fees', 'brokerCommission', 'basis'] as (string | number)[],
      message: '原始实际份额按股佣金与perBarCap部分成交的累计计费尚不支持；请保留配置并选择已支持的整笔研究方式。',
    }];
  });
}
