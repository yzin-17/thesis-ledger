import { z } from 'zod';

const count = z.number().int().nonnegative();
/** 来源标准化质量与原业务响应；供应商字段只存在于不透明原文。 */
export const marketCashAssessmentV3Schema = z
  .strictObject({
    version: z.literal('cash-record-assessment-v1'),
    responseComplete: z.literal(true),
    transportCountVerified: z.boolean(),
    historicalCoverageVerified: z.literal(false),
    rawItemCount: count,
    counts: z.strictObject({
      usable: count,
      excluded: count,
      duplicate: count,
      'outside-window': count,
      placeholder: count,
    }),
    observations: z
      .array(
        z.strictObject({
          rowIndex: count,
          sourceStatus: z.string().nullable(),
          normalizedStatus: z.enum(['unknown', 'implemented', 'preliminary', 'cancelled']),
          sourceAmount: z.string().nullable(),
          amountPerFundUnit: z.string().nullable(),
          currency: z.literal('CNY'),
          identityBasis: z.enum(['request-bound', 'supplier-code-echo']),
          currencyBasis: z.literal('explicit-research-scope'),
          announcementDate: z.iso.date().nullable(),
          recordDate: z.iso.date().nullable(),
          effectiveDate: z.iso.date().nullable(),
          paymentDate: z.iso.date().nullable(),
          issues: z.array(z.string().min(1)),
          disposition: z.enum(['usable', 'excluded', 'duplicate', 'outside-window', 'placeholder']),
        }),
      )
      .max(5_000),
    rawBusinessResponse: z
      .string()
      .min(1)
      .max(1024 * 1024),
  })
  .superRefine((value, ctx) => {
    for (const name of Object.keys(value.counts) as (keyof typeof value.counts)[]) {
      if (
        value.counts[name] !== value.observations.filter((row) => row.disposition === name).length
      )
        ctx.addIssue({
          code: 'custom',
          path: ['counts', name],
          message: '分红质量计数与记录不一致',
        });
    }
    if (value.observations.length > value.rawItemCount)
      ctx.addIssue({ code: 'custom', path: ['rawItemCount'], message: '分红原始条数不一致' });
  });
