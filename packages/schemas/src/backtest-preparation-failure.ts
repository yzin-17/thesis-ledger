import { z } from 'zod';
import { backtestRunPreparationRequestV3Schema } from './backtest-run-preparation-v3.js';

/** 尚未生成正式运行配置的失败请求；不能作为可执行 Run 消费。 */
export const backtestPreparationFailureInputSchema = z.strictObject({
  contractVersion: z.literal(3),
  schemaVersion: z.literal('3'),
  kind: z.literal('preparation-failure'),
  submissionId: z.uuid(),
  preparation: backtestRunPreparationRequestV3Schema,
});
export type BacktestPreparationFailureInput = z.infer<typeof backtestPreparationFailureInputSchema>;
