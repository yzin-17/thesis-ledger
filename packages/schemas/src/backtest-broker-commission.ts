import { z } from 'zod';
import { nonNegativeDecimalStringSchema as amount, positiveDecimalStringSchema } from './monetary-values.js';

const variableCharge = z.strictObject({
  rate: amount,
  minimumAmount: amount,
  maximumTurnoverRatio: positiveDecimalStringSchema.nullable(),
});
export const brokerCommissionSchemaV3 = z.strictObject({
  broker: z.literal('futu-hk'),
  plan: z.literal('standard-fixed-platform'),
  sourceUrl: z.url(),
  checkedDate: z.iso.date(),
  applicability: z.literal('current-schedule-research'),
  userModified: z.boolean(),
  collection: z.literal('single-fill-order-v1'),
  basis: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('turnover') }),
    z.strictObject({ kind: z.literal('actualShares') }),
    z.strictObject({ kind: z.literal('referencePrice'), price: positiveDecimalStringSchema }),
  ]),
  commission: variableCharge,
  platformFee: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('fixed'), amount }),
    z.strictObject({ kind: z.literal('perShare'), ...variableCharge.shape }),
  ]),
}).superRefine((value, ctx) => {
  if ((value.basis.kind === 'turnover') !== (value.platformFee.kind === 'fixed'))
    ctx.addIssue({ code: 'custom', path: ['platformFee'], message: '成交额口径配固定平台费，股数口径配每股平台费' });
  for (const key of ['commission', 'platformFee'] as const) {
    const fee = value[key];
    if ('maximumTurnoverRatio' in fee && fee.maximumTurnoverRatio && Number(fee.maximumTurnoverRatio) > 1)
      ctx.addIssue({ code: 'custom', path: [key, 'maximumTurnoverRatio'], message: '收费上限比例不能大于1' });
  }
});
