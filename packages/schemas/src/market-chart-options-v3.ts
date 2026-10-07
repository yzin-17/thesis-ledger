import { z } from 'zod';
import { priceAdjustmentSchema } from './market-price-protocol.js';
import { routeAvailabilityReasonV3Schema } from './market-route-v3.js';

export const marketChartOptionsWindowV3Schema = z
  .strictObject({ start: z.iso.date(), end: z.iso.date() })
  .refine((window) => window.start <= window.end, '图表窗口起点不得晚于终点');
export type MarketChartOptionsWindowV3 = z.infer<typeof marketChartOptionsWindowV3Schema>;
export const marketChartPlanV3Schema = z.strictObject({
  barsLimit: z.number().int().min(1).max(3000),
  indicatorParams: z.record(z.string(), z.number().finite()).default({}),
  end: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).optional(),
});
export type MarketChartPlanV3 = z.infer<typeof marketChartPlanV3Schema>;

export const marketChartOptionsV3Schema = z
  .strictObject({
    contractVersion: z.literal(3),
    symbol: z.string().min(1),
    mode: z.enum(['legacy', 'v3', 'unknown']),
    window: marketChartOptionsWindowV3Schema.optional(),
    plan: marketChartPlanV3Schema.optional(),
    options: z
      .array(
        z.strictObject({
          adjustment: priceAdjustmentSchema,
          available: z.boolean(),
          availableVia: z.enum(['primary', 'backup']).optional(),
          reason: z
            .union([
              routeAvailabilityReasonV3Schema,
              z.enum(['route_not_configured', 'catalog_unavailable']),
            ])
            .nullable(),
        }),
      )
      .length(3),
  })
  .superRefine((value, context) => {
    if (value.plan && !value.window)
      context.addIssue({ code: 'custom', path: ['window'], message: '图表规划必须返回获取窗口' });
    if (new Set(value.options.map((option) => option.adjustment)).size !== 3) {
      context.addIssue({ code: 'custom', path: ['options'], message: '必须逐一报告三种价格口径' });
    }
    value.options.forEach((option, index) => {
      if (option.availableVia && !option.available) {
        context.addIssue({
          code: 'custom',
          path: ['options', index],
          message: '标明主备来源时该口径必须可用',
        });
      }
      if (
        option.available !== (option.reason === null) ||
        (value.mode !== 'v3' && option.available)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['options', index],
          message: '口径可用性与协议状态不一致',
        });
      }
    });
  });
export type MarketChartOptionsV3 = z.infer<typeof marketChartOptionsV3Schema>;
