import { z } from 'zod';
import { nonNegativeDecimalStringSchema, positiveDecimalStringSchema } from './monetary-values.js';
import { brokerCommissionSchemaV3 } from './backtest-broker-commission.js';

const text = z.string().trim().min(1);
const currency = z.enum(['CNY', 'HKD', 'USD']);
export const executionFeeMinimumSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('amount'), amount: positiveDecimalStringSchema }),
]);
const charged = z.strictObject({ treatment: z.literal('charged'), side: z.enum(['buy', 'sell', 'both']),
  basis: z.literal('turnover'), currency, rate: nonNegativeDecimalStringSchema, minimum: executionFeeMinimumSchema });
const included = z.strictObject({ treatment: z.literal('includedInCommission'), reason: text });
const excluded = z.strictObject({ treatment: z.literal('notApplicable'), reason: text });
const fee = z.discriminatedUnion('treatment', [charged, included, excluded]);

export const executionModelFeesSchema = z.strictObject({
  currency, rounding: z.strictObject({ mode: z.literal('halfUp'), decimalPlaces: z.literal(2) }),
  collection: z.literal('perFillPerCharge'), commission: charged,
  stampDuty: fee, transferFee: fee, regulatoryFee: fee, handlingFee: fee,
}).superRefine((value, ctx) => {
  for (const key of ['commission', 'stampDuty', 'transferFee', 'regulatoryFee', 'handlingFee'] as const) {
    const charge = value[key];
    if (charge.treatment === 'charged' && charge.currency !== value.currency)
      ctx.addIssue({ code: 'custom', path: [key, 'currency'], message: '费用币种必须与模型一致' });
    if (charge.treatment === 'includedInCommission' && value.commission.side !== 'both')
      ctx.addIssue({ code: 'custom', path: [key], message: '包含规费的佣金必须覆盖买卖两侧' });
  }
});

export const publicFeeRoundingV3Schema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('halfUp'), decimalPlaces: z.literal(2) }),
  z.strictObject({ mode: z.literal('ceil'), decimalPlaces: z.literal(0) }),
]);
const stampDutyV3 = z.discriminatedUnion('treatment', [
  charged.extend({ amountRounding: publicFeeRoundingV3Schema.optional() }), included, excluded,
]);
const actualSharesFee = z.strictObject({ treatment: z.literal('charged'), side: z.literal('sell'),
  basis: z.literal('actualShares'), currency: z.literal('USD'), rate: positiveDecimalStringSchema,
  minimum: z.strictObject({ kind: z.literal('none') }), maximumAmount: positiveDecimalStringSchema,
  lowPriceExemption: z.literal('belowPerShareRate') });

/** V3新增费项显式封存；V1/V2的费用结构继续严格拒绝这些字段。 */
export const executionModelFeesV3Schema = executionModelFeesSchema.safeExtend({
  brokerCommission: brokerCommissionSchemaV3.optional(),
  stampDuty: stampDutyV3,
  afrcLevy: charged.optional(),
  tradingActivityFee: actualSharesFee.optional(),
}).superRefine((value, ctx) => {
  if (value.brokerCommission) {
    if (value.commission.rate !== '0' || value.commission.minimum.kind !== 'none' || value.commission.side !== 'both')
      ctx.addIssue({ code: 'custom', path: ['commission'], message: '券商成本已单独配置，旧佣金须为双侧零费率且无最低额' });
    if ((value.currency === 'HKD') !== (value.brokerCommission.basis.kind === 'turnover') || value.currency === 'CNY')
      ctx.addIssue({ code: 'custom', path: ['brokerCommission', 'basis'], message: '富途港股使用港元成交额，美股使用美元股数口径' });
    for (const key of ['stampDuty', 'transferFee', 'regulatoryFee', 'handlingFee'] as const)
      if (value[key].treatment === 'includedInCommission')
        ctx.addIssue({ code: 'custom', path: [key], message: '富途佣金预设不自动包含公共收费' });
  }
  for (const key of ['afrcLevy', 'tradingActivityFee'] as const) {
    if (value[key] && value[key].currency !== value.currency)
      ctx.addIssue({ code: 'custom', path: [key, 'currency'], message: '新增费项币种必须与模型一致' });
  }
  if (value.stampDuty.treatment === 'charged' && value.stampDuty.amountRounding?.mode === 'ceil' && value.currency !== 'HKD')
    ctx.addIssue({ code: 'custom', path: ['stampDuty', 'amountRounding'], message: '整港元进位仅用于HKD印花税' });
  if (value.afrcLevy && (value.currency !== 'HKD' || value.afrcLevy.side !== 'both'))
    ctx.addIssue({ code: 'custom', path: ['afrcLevy'], message: 'AFRC费项须为港元双侧收费' });
});
