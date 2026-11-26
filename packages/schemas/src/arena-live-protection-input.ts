import { z } from 'zod';

const positive = z.string().regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,40})?$/).refine(v => /[1-9]/.test(v), '数值须大于零');
export const arenaExitQuantitySchema = z.discriminatedUnion('basis', [
  z.strictObject({ basis: z.literal('parent_open_quantity') }),
  z.strictObject({ basis: z.literal('parent_filled_fraction'), numerator: z.number().int().positive().max(10000),
    denominator: z.number().int().positive().max(10000) }).refine(v => v.numerator <= v.denominator, '退出比例不得超过本批成交量'),
]);
export const arenaTrailingStopSchema = z.strictObject({
  priceSource: z.literal('executable_quote'), reference: z.literal('highest_since_activation'),
  distance: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('amount'), value: positive }),
    z.strictObject({ kind: z.literal('percent'), value: positive.refine(v => Number(v) < 100, '回撤比例须小于100%') }),
  ]),
  breakEven: z.strictObject({ triggerGainPercent: positive, reference: z.literal('gross_average_entry_price') }).nullable(),
}).describe('仅使用激活后合格可执行报价更新高水位，卖出触发线按价格步长向下取整；初始price是最低保护线。保本参考本批成交均价，不含费用。');
