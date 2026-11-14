import { z } from 'zod';
import { arenaStateSchema } from './model-arena.js';
import { arenaLiveRemainingBudgetSchema } from './arena-live-budget.js';
import { arenaLiveTimelineSchema } from './arena-live-timeline.js';
import {
  arenaDecimalSchema, arenaPositiveDecimalSchema, arenaOrderInputSchema,
  arenaWakeupInputSchema, arenaLiveProtocolSchema, arenaLiveDecisionSchema,
} from './arena-live-protocol.js';
const signed = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);

export const arenaLiveOrderSchema = z.strictObject({
  ...arenaOrderInputSchema.shape,
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  activeSince: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  state: z.enum(['active', 'filled', 'cancelled', 'expired', 'rejected']),
  reservedCash: arenaDecimalSchema,
  reason: z.string().nullable(),
});
export const arenaLiveWakeupSchema = z.strictObject({
  id: z.uuid(), condition: arenaWakeupInputSchema,
  createdAt: z.iso.datetime(), firedAt: z.iso.datetime().nullable(),
});
export const arenaLiveFillSchema = z.strictObject({
  id: z.uuid(), orderId: z.uuid(), symbol: z.string(), side: z.enum(['buy', 'sell']),
  quantity: arenaPositiveDecimalSchema, price: arenaPositiveDecimalSchema,
  fee: arenaDecimalSchema, cashDelta: z.string(),
  marketTime: z.iso.datetime(), recordedAt: z.iso.datetime(), sourceRef: z.string(),
  evidence: z.unknown().nullable(),
});
export const arenaLiveAccountSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  cash: arenaDecimalSchema,
  positions: z.array(z.strictObject({
    symbol: z.string(), quantity: arenaPositiveDecimalSchema,
    acquiredOn: z.iso.date(), availableOn: z.iso.date(),
  })),
  cashSettlements: z.array(z.strictObject({ amount: arenaPositiveDecimalSchema, availableOn: z.iso.date() })),
  orders: z.array(arenaLiveOrderSchema),
  wakeups: z.array(arenaLiveWakeupSchema),
  watchedSymbols: z.array(z.string()),
  fills: z.array(arenaLiveFillSchema),
});
export type ArenaLiveAccount = z.infer<typeof arenaLiveAccountSchema>;
export type ArenaLiveOrder = z.infer<typeof arenaLiveOrderSchema>;
export type ArenaLiveWakeup = z.infer<typeof arenaLiveWakeupSchema>;

export const arenaLiveCycleSchema = z.strictObject({
  id: z.uuid(), agentId: z.uuid(),
  state: z.enum(['pending', 'running', 'succeeded', 'failed', 'unknown_usage', 'cancelled']),
  trigger: z.string(), attempt: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(), completedAt: z.iso.datetime().nullable(),
  asOf: z.iso.datetime().nullable().default(null),
  reason: z.string().nullable(), decision: arenaLiveDecisionSchema.nullable(),
  requestId: z.uuid().nullable(), usage: z.unknown().nullable(),
});
export const arenaLiveAgentSchema = z.strictObject({
  id: z.uuid(), providerId: z.string(), model: z.string(),
  remaining: arenaLiveRemainingBudgetSchema, account: arenaLiveAccountSchema,
  state: z.enum(['waiting', 'researching', 'needs_attention', 'budget_exhausted']),
  reason: z.string().nullable(), cycles: z.array(arenaLiveCycleSchema),
  availability: z.strictObject({ tradingDate: z.iso.date().nullable(), cash: signed.nullable(), shares: z.record(z.string(), signed) }),
});
export const arenaLiveMarkSchema = z.strictObject({
  agentId: z.uuid(), nav: arenaDecimalSchema.nullable(),
  returnRatio: signed.nullable(), drawdown: arenaDecimalSchema.nullable(),
  peakNav: arenaDecimalSchema.nullable(), rank: z.number().int().positive().nullable(),
  complete: z.boolean(), reason: z.string().nullable(),
});
export const arenaLiveFrameSchema = z.strictObject({
  kind: z.enum(['valuation', 'gap']).default('valuation'),
  gapBefore: z.array(z.string()).default([]),
  at: z.iso.datetime(), marketTime: z.iso.datetime().nullable(),
  complete: z.boolean(), reason: z.string().nullable(),
  marks: z.array(arenaLiveMarkSchema),
  benchmarks: z.array(z.strictObject({ id: z.string(), nav: arenaDecimalSchema.nullable(), returnRatio: signed.nullable() })),
});
export const arenaLiveSummarySchema = z.strictObject({
  id: z.uuid(), state: arenaStateSchema, protocol: arenaLiveProtocolSchema,
  createdAt: z.iso.datetime(), startedAt: z.iso.datetime().nullable(), endedAt: z.iso.datetime().nullable(),
});
export const arenaLiveDetailSchema = arenaLiveSummarySchema.extend({
  timeline: arenaLiveTimelineSchema.nullable().default(null),
  agents: z.array(arenaLiveAgentSchema),
  frames: z.array(arenaLiveFrameSchema),
  sealedFrame: arenaLiveFrameSchema.nullable(),
  remaining: arenaLiveRemainingBudgetSchema,
  periodReturns: z.array(z.strictObject({ period: z.enum(['today', 'week', 'month', 'all']),
    rows: z.array(z.strictObject({ agentId: z.uuid(), returnRatio: signed.nullable() })),
  })),
  session: z.unknown().nullable(),
  instrumentDirectory: z.record(z.string(), z.string()),
});
export type ArenaLiveDetail = z.infer<typeof arenaLiveDetailSchema>;
export type ArenaLiveFrame = z.infer<typeof arenaLiveFrameSchema>;
export const arenaLiveRetryReceiptSchema = z.strictObject({ id: z.uuid(), state: z.literal('waiting') });
export const arenaLiveManualTriggerReceiptSchema = arenaLiveRetryReceiptSchema.extend({
  state: z.enum(['waiting', 'researching']),
  appointment: z.enum(['scheduled', 'already_scheduled', 'already_in_progress']),
});
