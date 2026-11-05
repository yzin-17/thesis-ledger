import { z } from 'zod';
import { marketMinutePeriodSchema } from './market-period.js';
import { marketDetailAssetTypeSchema } from './market.js';

const window = z
  .strictObject({
    start: z.iso.date(),
    end: z.iso.date(),
    minutePointCount: z.number().int().positive().max(64_000),
    calendarRevision: z.string().min(1),
  })
  .refine((value) => value.start <= value.end, '分钟来源窗口必须有序');
const availability = z
  .strictObject({
    available: z.boolean(),
    reason: z.string().min(1).nullable(),
    window: window.optional(),
  })
  .superRefine((value, context) => {
    if (value.available !== (value.reason === null) || (value.available && !value.window))
      context.addIssue({ code: 'custom', message: '分钟能力就绪必须包含完整规划窗口且无失败原因' });
  });
const indicator = availability.safeExtend({
  name: z.enum(['MA', 'MACD', 'RSI']),
  parameters: z.record(z.string(), z.number().finite()),
});
const option = availability
  .safeExtend({
    timeframe: marketMinutePeriodSchema,
    kind: z.literal('derived'),
    limit: z.number().int().positive().max(3000),
    indicators: z.array(indicator).length(3),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.indicators.map((item) => item.name)).size !== 3 ||
      (!value.available && value.indicators.some((item) => item.available))
    )
      context.addIssue({ code: 'custom', message: '分钟周期及三个独立指标声明不一致' });
  });
export const marketMinuteOptionsSchema = z
  .strictObject({
    version: z.literal('market-minute-options-v1'),
    symbol: z.string().trim().min(1),
    assetType: marketDetailAssetTypeSchema,
    adjustment: z.literal('none'),
    evaluationAsOf: z.iso.datetime({ offset: true }),
    options: z.array(option).length(4),
  })
  .superRefine((value, context) => {
    if (new Set(value.options.map((item) => item.timeframe)).size !== 4)
      context.addIssue({ code: 'custom', message: '四种分钟周期必须分别声明' });
  });
export type MarketMinuteOptions = z.infer<typeof marketMinuteOptionsSchema>;
