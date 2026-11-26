import { z } from 'zod';
import { arenaOrderInputSchema } from './arena-live-protocol.js';

// 生成端显式表达跨字段限制，使 JSON Schema 与运行时拒绝口径一致。
const protection = arenaOrderInputSchema.shape.onFill.unwrap().unwrap();
const leg = protection.shape.activateOrders.element.meta({ id: 'ArenaGeneratedExitLegV6' });
const lifecycle = { afterExit: z.enum(['cancel_entry_remainder', 'keep_entry_remainder']) };
const generatedProtection = z.discriminatedUnion('exitPolicy', [
  protection.extend({ ...lifecycle, exitPolicy: z.literal('single'),
    activateOrders: z.array(leg.extend({ kind: z.literal('stop_loss'),
      exitGroup: z.null().optional(), quantity: z.strictObject({ basis: z.literal('parent_open_quantity') }) })).length(1) }),
  protection.extend({ ...lifecycle, exitPolicy: z.literal('oco'), activateOrders: z.array(leg).length(2) }),
  protection.extend({ ...lifecycle, exitPolicy: z.literal('staged'), activateOrders: z.array(leg).min(2).max(11) }),
]).meta({ id: 'ArenaGeneratedFillProtectionV6' });
const buy = { side: z.literal('buy'), exitGroup: z.null(), onFill: generatedProtection.nullable().optional() };
const sell = { side: z.literal('sell'), onFill: z.null().optional(), entryAfter: z.null().optional() };
const market = { kind: z.literal('market'), expiresOn: z.null(), exitGroup: z.null() };
const priced = { price: arenaOrderInputSchema.shape.price.unwrap() };

export const arenaLiveGeneratedOrderSchema = z.discriminatedUnion('side', [
  z.discriminatedUnion('kind', [
    arenaOrderInputSchema.safeExtend({ ...buy, ...market }),
    arenaOrderInputSchema.safeExtend({ ...buy, ...priced, kind: z.literal('limit') }),
  ]),
  z.discriminatedUnion('kind', [
    arenaOrderInputSchema.safeExtend({ ...sell, ...market }),
    arenaOrderInputSchema.safeExtend({ ...sell, ...priced, kind: z.literal('limit'), exitGroup: z.null() }),
    arenaOrderInputSchema.safeExtend({ ...sell, ...priced, kind: z.literal('stop_loss') }),
    arenaOrderInputSchema.safeExtend({ ...sell, ...priced, kind: z.literal('take_profit') }),
  ]),
]);
