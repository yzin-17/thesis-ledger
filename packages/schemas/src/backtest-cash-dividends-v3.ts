import { z } from 'zod';
import { nonNegativeDecimalStringSchema, positiveDecimalStringSchema } from './monetary-values.js';
import { marketNoticeDividendPackV3Schema } from './market-notice-dividends-v3.js';

const document = marketNoticeDividendPackV3Schema.shape.sourceDocuments.element.pick({
  id: true,
  title: true,
  url: true,
  sha256: true,
  publishedDate: true,
  observedAt: true,
});
export const backtestCashDividendDisclosureV3Schema = z.strictObject({
  model: z.literal('ex-date-entitlement-payment-date-cash-v1'),
  splitEvents: z.literal('not-modelled'),
  historicalAvailability: z.literal('notVerified'),
  records: z
    .array(
      z.strictObject({
        symbol: z.string().min(1),
        effectiveDate: z.iso.date(),
        recordDate: z.iso.date(),
        paymentDate: z.iso.date(),
        amountPerFundUnit: positiveDecimalStringSchema,
        currency: z.literal('CNY'),
        eligibleQuantity: nonNegativeDecimalStringSchema.nullable(),
        grossCashAmount: nonNegativeDecimalStringSchema.nullable(),
        status: z.enum(['receivable', 'paid', 'unavailable']),
        reason: z.string().min(1).optional(),
        provider: z.string().min(1),
        providerRevision: z.string().min(1),
        observedAt: z.iso.datetime({ offset: true }),
        sourceDocuments: z.array(document).min(2),
      }),
    )
    .superRefine((records, ctx) => {
      const keys = records.map((record) => `${record.symbol}:${record.effectiveDate}`);
      if (new Set(keys).size !== keys.length)
        ctx.addIssue({ code: 'custom', message: '现金结果事件重复' });
      records.forEach((record, index) => {
        if (
          record.status === 'unavailable' &&
          (record.eligibleQuantity !== null || record.grossCashAmount !== null || !record.reason)
        )
          ctx.addIssue({ code: 'custom', path: [index], message: '未入账事件不得补造金额' });
        if (
          record.status !== 'unavailable' &&
          (record.eligibleQuantity === null || record.grossCashAmount === null)
        )
          ctx.addIssue({ code: 'custom', path: [index], message: '已入账事件缺资格数量或金额' });
      });
    }),
});
export type BacktestCashDividendDisclosureV3 = z.infer<
  typeof backtestCashDividendDisclosureV3Schema
>;
