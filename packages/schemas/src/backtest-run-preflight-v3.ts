import { z } from 'zod';
import { runConfigSchemaV3 } from './backtest-contract.js';

export const backtestRunPreflightRequestV3Schema = z.strictObject({
  contractVersion: z.literal(3),
  requestId: z.string().trim().min(1).max(200),
  strategyVersionId: z.uuid(),
  runConfig: runConfigSchemaV3,
});
export type BacktestRunPreflightRequestV3 = z.infer<typeof backtestRunPreflightRequestV3Schema>;
