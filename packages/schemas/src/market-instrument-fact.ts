import { z } from 'zod';
const symbol = z.string().min(1).max(80);
const money = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const ref = z.string().min(1).max(500);
export const marketInstrumentFactSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('daily_bar'),
    symbol,
    ref,
    availableAt: z.iso.datetime(),
    observedAt: z.iso.datetime(),
    date: z.iso.date(),
    open: money,
    close: money,
    high: money.optional(),
    low: money.optional(),
  }),
  z.strictObject({
    kind: z.literal('news'),
    ref,
    symbol,
    date: z.iso.date(),
    availableAt: z.iso.datetime(),
    publishedAt: z.iso.datetime(),
    title: z.string().max(1000),
    publisher: z.string().nullable(),
    url: z.url(),
    excerpt: z.string().max(500).nullable(),
  }),
  z.strictObject({
    kind: z.literal('report'),
    symbol,
    ref,
    availableAt: z.iso.datetime(),
    date: z.iso.date(),
    title: z.string().max(400),
    publisher: z.string().max(160),
    url: z.url(),
  }),
]);
export type MarketInstrumentFact = z.infer<typeof marketInstrumentFactSchema>;
