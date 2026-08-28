import { z } from 'zod';

export const ledgerEventTypes = [
  'BUY',
  'SELL',
  'DIVIDEND',
  'FEE',
  'TAX',
  'INTEREST',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'CASH_DEPOSIT',
  'CASH_WITHDRAW',
  'BONUS',
  'SPLIT',
  'MERGE',
  'ADJUSTMENT',
] as const;

const tradeTypes = new Set(['BUY', 'SELL']);
const cashTypes = new Set([
  'DIVIDEND',
  'FEE',
  'TAX',
  'INTEREST',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'CASH_DEPOSIT',
  'CASH_WITHDRAW',
]);
const actionTypes = new Set(['BONUS', 'SPLIT', 'MERGE']);

export const ledgerEventSchemaV1 = z
  .object({
    version: z.literal(1).default(1),
    id: z.uuid(),
    accountId: z.uuid(),
    type: z.enum(ledgerEventTypes),
    occurredAt: z.iso.datetime(),
    symbol: z.string().optional(),
    quantity: z.number().positive().optional(),
    price: z.number().nonnegative().optional(),
    amount: z.number().optional(),
    fee: z.number().nonnegative().optional(),
    tax: z.number().nonnegative().optional(),
    currency: z.enum(['CNY', 'HKD', 'USD']).default('CNY'),
    source: z.string().min(1),
    externalUid: z.string().min(1),
    note: z.string().max(1000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((event, context) => {
    if (
      tradeTypes.has(event.type) &&
      (!event.symbol || !event.quantity || event.price === undefined)
    )
      context.addIssue({ code: 'custom', message: '交易事件需要 symbol、quantity 和 price' });
    if (cashTypes.has(event.type) && event.amount === undefined)
      context.addIssue({ code: 'custom', message: '现金事件需要 amount' });
    if (actionTypes.has(event.type) && (!event.symbol || !event.quantity))
      context.addIssue({ code: 'custom', message: '公司行动需要 symbol 和 quantity' });
    if (event.type === 'ADJUSTMENT' && !event.note?.trim())
      context.addIssue({ code: 'custom', message: '受控修正 Adjustment 必须填写 note' });
  });

export type LedgerEventV1 = z.infer<typeof ledgerEventSchemaV1>;
