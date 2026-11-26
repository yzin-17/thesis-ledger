import { strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';

/** 校验策略定义并固定新写入的入场策略。 */
export function requireNewStrategyDefinition(input: unknown): BacktestStrategy {
  const definition = strategySchema.parse(input) as BacktestStrategy;
  return definition.entryTrigger ? definition : { ...definition, entryTrigger: 'rising-edge' };
}
