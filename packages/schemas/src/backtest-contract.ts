export * from './backtest-values.js';
export * from './backtest-strategy.js';
export * from './backtest-run.js';
export * from './backtest-result.js';
import { strategySchema } from './backtest-strategy.js';
import { runConfigSchemaV3 } from './backtest-run.js';
import { backtestResultSchemaV3, backtestErrorSchema } from './backtest-result.js';
export const backtestContractSchemasV3 = {
  strategy: strategySchema,
  runConfig: runConfigSchemaV3,
  result: backtestResultSchemaV3,
  error: backtestErrorSchema,
} as const;
