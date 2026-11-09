import { z } from 'zod';
import { backtestExecutionModelSchemaV3 } from './backtest-execution-model.js';

export const backtestModelResolutionRequestSchema = z
  .strictObject({
    strategyVersionId: z.uuid(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    currency: z.enum(['CNY', 'HKD', 'USD']),
    adjustment: z.enum(['none', 'qfq', 'hfq']),
    policy: z.enum(['research-defaults', 'historical-rules']).default('research-defaults'),
  })
  .refine((value) => value.startDate <= value.endDate, {
    path: ['endDate'],
    message: '开始日期不能晚于结束日期',
  });
export const backtestModelResolutionResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('available'),
    model: backtestExecutionModelSchemaV3,
    policy: z.enum(['research-defaults', 'historical-rules']).optional(),
    notes: z.array(z.string().min(1)).max(10).optional(),
  }),
  z.strictObject({
    status: z.literal('blocked'),
    reasonCode: z.enum(['unsupported-strategy', 'rules-unavailable', 'rules-incompatible']),
    message: z.string().min(1),
  }),
]);
export type BacktestModelResolutionRequest = z.input<typeof backtestModelResolutionRequestSchema>;
export type BacktestModelResolutionResult = z.infer<typeof backtestModelResolutionResultSchema>;
