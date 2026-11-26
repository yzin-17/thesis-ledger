import { z } from 'zod';
import { nonNegativeDecimalStringSchema, positiveDecimalStringSchema } from './monetary-values.js';
import {
  backtestDailyMatchingSchema,
  backtestOrderActionSchema,
  backtestOrderValiditySchema,
} from './backtest-daily-orders.js';

const id = z.string().min(1),
  index = z.number().int().nonnegative();
const phase = z.enum(['open', 'range']);
const point = z.strictObject({ barIndex: index, phase });
const price = z.union([
  z.strictObject({ kind: z.literal('market') }),
  z.strictObject({ kind: z.enum(['limit', 'stopMarket']), price: positiveDecimalStringSchema }),
]);
const order = z.strictObject({
  id,
  templateId: id,
  cycleId: id,
  side: z.enum(['buy', 'sell']),
  action: backtestOrderActionSchema,
  quantityBasis: z.enum(['actual-units', 'normalized-units']),
  quantity: nonNegativeDecimalStringSchema,
  filledQuantity: nonNegativeDecimalStringSchema,
  remainingQuantity: nonNegativeDecimalStringSchema,
  acceptedSequence: index,
  validity: backtestOrderValiditySchema,
  price,
  parent: z.strictObject({ orderId: id, activation: z.enum(['eachFill', 'fullFill']) }).optional(),
  exitGroup: id.optional(),
  state: z.enum([
    'waiting_parent',
    'active',
    'partially_filled',
    'filled',
    'cancelled',
    'expired',
    'rejected',
  ]),
  activatedBarIndex: index.optional(),
  eligibleFrom: point.optional(),
  triggeredAt: point.optional(),
  fills: z.array(z.strictObject({ fillId: id, quantity: positiveDecimalStringSchema, at: point })),
});

/** 结果中的原始订单事实与显式模拟政策，一并参与结果校验和。 */
export const backtestDailyOrderResultSchema = z.strictObject({
  matching: backtestDailyMatchingSchema,
  orders: z.array(order),
  fills: z.array(
    z.strictObject({
      fillId: id,
      orderId: id,
      quantity: positiveDecimalStringSchema,
      price: positiveDecimalStringSchema,
      at: point,
    }),
  ),
  exits: z.record(id, nonNegativeDecimalStringSchema),
  currentBar: z
    .strictObject({
      key: id,
      index,
      consumed: nonNegativeDecimalStringSchema,
      phases: z.array(phase),
    })
    .optional(),
  rejects: z.array(z.strictObject({ orderId: id, reason: z.string() })),
  conflicts: z.array(
    z.strictObject({ barKey: id, exitGroup: id, resolution: z.literal('stopFirst') }),
  ),
});
