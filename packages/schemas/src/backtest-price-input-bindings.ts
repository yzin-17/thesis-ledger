import { z } from 'zod';

export const backtestPriceInputBindingsSchemaV3 = z
  .strictObject({
    signals: z.array(
      z.strictObject({
        sourceId: z.string().trim().min(1),
        binding: z.literal('execution-series'),
      }),
    ),
    benchmark: z.strictObject({ binding: z.literal('execution-series') }),
  })
  .superRefine((value, context) => {
    const sourceIds = new Set(value.signals.map(({ sourceId }) => sourceId));
    if (sourceIds.size !== value.signals.length) {
      context.addIssue({
        code: 'custom',
        path: ['signals'],
        message: 'signals 中的 sourceId 不能重复',
      });
    }
  });

export type BacktestPriceInputBindingsV3 = z.infer<typeof backtestPriceInputBindingsSchemaV3>;
