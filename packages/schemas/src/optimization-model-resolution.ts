import { z } from 'zod';
import { optimizationPreparationTargetSchema } from './optimization-run-preparation.js';

export const optimizationModelResolutionRequestSchema = z
  .strictObject({
    target: optimizationPreparationTargetSchema,
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    currency: z.enum(['CNY', 'HKD', 'USD']),
    adjustment: z.literal('hfq'),
  })
  .refine((value) => value.startDate <= value.endDate, {
    path: ['endDate'],
    message: '开始日期不能晚于结束日期',
  });
export type OptimizationModelResolutionRequest = z.infer<
  typeof optimizationModelResolutionRequestSchema
>;
