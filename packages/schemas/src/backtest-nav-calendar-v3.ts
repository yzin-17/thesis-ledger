import { z } from 'zod';

/** 严格模式使用独立日历；研究模式显式绑定来源日期构造假设。 */
export const backtestNavPlanningCalendarV3Schema = z.strictObject({
  symbol: z.string().regex(/^\d{6}\.OF$/),
  market: z.literal('CN'),
  timezone: z.literal('Asia/Shanghai'),
  version: z.string().trim().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceRef: z.string().trim().min(1),
  availableAt: z.iso.datetime({ offset: true }),
  coverage: z.strictObject({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    complete: z.literal(true),
  }),
  valuationDates: z.array(z.iso.date()).min(1),
  tradingDates: z.array(z.iso.date()).min(1),
  disclosureWorkDates: z.array(z.iso.date()).min(1),
});
