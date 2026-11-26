import { BadRequestException } from '@nestjs/common';
import {
  strategyAddGainIssues,
  strategyCrossDescriptionIssues,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';

export function assertDiscoverySemantics(strategy: BacktestStrategy, reason?: string) {
  const signals = strategyCrossDescriptionIssues(strategy);
  if (signals.length)
    throw new BadRequestException({
      code: 'STRATEGY_SIGNAL_SEMANTIC_MISMATCH',
      message: 'AI 策略交叉方向与说明不一致',
      issues: signals,
    });
  const percentages = strategyAddGainIssues(strategy, [strategy.description ?? '', reason ?? '']);
  if (percentages.length)
    throw new BadRequestException({
      code: 'STRATEGY_PLAN_PERCENT_MISMATCH',
      message: 'AI 加仓百分比与明确说明不一致',
      issues: percentages,
    });
}
