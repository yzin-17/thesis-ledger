import { z } from 'zod';
import { marketDerivedTimeframeSchema } from './market-period.js';
import { marketDetailAssetTypeSchema } from './market.js';
import { priceAdjustmentSchema } from './market-price-protocol.js';

const window = z
  .strictObject({
    start: z.iso.date(),
    end: z.iso.date(),
    dailyPointCount: z.number().int().positive().max(3650),
    calendarRevision: z.string().min(1),
  })
  .refine((value) => value.start <= value.end, '基础窗口必须有序');
const availability = z
  .strictObject({
    available: z.boolean(),
    reason: z.string().min(1).nullable(),
    window: window.optional(),
  })
  .superRefine((value, context) => {
    if (value.available !== (value.reason === null) || (value.available && !value.window))
      context.addIssue({ code: 'custom', message: '能力就绪必须无失败原因且保留实际计划窗口。' });
  });
const indicator = availability.safeExtend({
  name: z.enum(['MA', 'MACD', 'RSI']),
  parameters: z.record(z.string(), z.number().finite()),
});
const option = availability
  .safeExtend({
    timeframe: marketDerivedTimeframeSchema,
    kind: z.literal('derived'),
    limit: z.number().int().positive().max(3650),
    indicators: z.array(indicator).length(3),
  })
  .superRefine((value, context) => {
    if (new Set(value.indicators.map((item) => item.name)).size !== 3)
      context.addIssue({ code: 'custom', message: '每周期必须独立声明 MA/MACD/RSI，不能重复。' });
    if (!value.available && value.indicators.some((item) => item.available))
      context.addIssue({ code: 'custom', message: '周期不可得时指标不能声明可得。' });
  });
export const marketPeriodOptionsSchema = z
  .strictObject({
    version: z.literal('market-period-options-v1'),
    symbol: z.string().trim().min(1),
    assetType: marketDetailAssetTypeSchema,
    adjustment: priceAdjustmentSchema,
    evaluationAsOf: z.iso.datetime({ offset: true }),
    options: z.array(option).length(4),
  })
  .superRefine((value, context) => {
    if (new Set(value.options.map((item) => item.timeframe)).size !== 4)
      context.addIssue({ code: 'custom', message: '四种派生周期声明必须唯一。' });
  });
export type MarketPeriodOptions = z.infer<typeof marketPeriodOptionsSchema>;
