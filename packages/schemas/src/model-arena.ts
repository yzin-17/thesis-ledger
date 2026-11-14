import { z } from 'zod';
import { marketQuoteSymbolSchema } from './market-quote-identity.js';
import { currencyForMarket } from './backtest-values.js';
import { currencySchema } from './market.js';

const label = z.string().trim().min(1).max(200);
const count = z.number().int().min(0).max(2147483647);
const money = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/);
const positiveMoney = money.refine((v) => Number(v) > 0, '金额须大于零');
const bps = z.number().int().min(0).max(10000);
export const arenaBudgetSchema = z.strictObject({
  requests: count,
  tokens: count,
  costMicros: count,
});
const entrant = z.strictObject({
  providerId: label,
  model: label,
  budget: arenaBudgetSchema,
  maxInputTokens: count.positive(),
  maxOutputTokens: count.positive(),
});
const instrument = z.strictObject({
  instrumentId: z.uuid(),
  symbol: marketQuoteSymbolSchema,
  assetType: z.enum(['STOCK', 'ETF']),
});
const unique = (values: string[]) => new Set(values).size === values.length;
export const arenaProtocolSchema = z
  .strictObject({
    version: z.literal(1),
    title: label,
    market: z.enum(['CN', 'HK', 'US']),
    currency: currencySchema,
    calendarId: label,
    calendarVersion: label,
    timeZone: z.enum(['Asia/Shanghai', 'Asia/Hong_Kong', 'America/New_York']),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    instruments: z.array(instrument).min(1).max(50),
    entrants: z.array(entrant).min(1).max(12),
    initialCash: positiveMoney,
    maxPositionBps: bps.positive(),
    fees: z.strictObject({
      version: label,
      buyBps: bps,
      sellBps: bps,
      minimum: money,
      slippageBps: bps.max(9999),
    }),
    benchmarks: z.tuple([z.literal('cash'), z.literal('equal_weight_buy_hold')]),
    decisionDeadlineMinutes: count.positive().max(1440),
    maxInfrastructureAttempts: count.positive().max(10),
    budgetCurrency: currencySchema,
    budget: arenaBudgetSchema,
  })
  .superRefine((p, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (p.startsOn > p.endsOn) issue('endsOn', '赛期结束早于开始');
    if (p.currency !== currencyForMarket[p.market]) issue('currency', '结算币种与市场不匹配');
    const zones = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' };
    if (p.timeZone !== zones[p.market]) issue('timeZone', '交易日时区与市场不匹配');
    if (!unique(p.entrants.map((e) => JSON.stringify([e.providerId, e.model]))))
      issue('entrants', '参赛模型绑定重复');
    if (
      !unique(p.instruments.map((i) => i.instrumentId)) ||
      !unique(p.instruments.map((i) => i.symbol))
    )
      issue('instruments', '标的池存在重复身份');
    const suffix = p.market === 'CN' ? /\.(SH|SZ|BJ)$/ : new RegExp('\\.' + p.market + '$');
    if (p.instruments.some((i) => !suffix.test(i.symbol))) issue('instruments', '比赛限同一市场');
  });
export type ArenaProtocol = z.infer<typeof arenaProtocolSchema>;
export type ArenaBudget = z.infer<typeof arenaBudgetSchema>;
export const arenaStateSchema = z.enum(['draft', 'running', 'paused', 'ended']);
export type ArenaState = z.infer<typeof arenaStateSchema>;
export function arenaCanTransition(from: ArenaState, to: ArenaState) {
  if (from === 'draft') return to === 'running';
  if (from === 'running') return to === 'paused' || to === 'ended';
  return from === 'paused' && (to === 'running' || to === 'ended');
}
export const arenaRoundStateSchema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('unopened'),
    reason: z.enum(['participant_budget', 'competition_budget', 'unknown_pricing']),
    entrantId: z.uuid().nullable(),
  }),
  z.strictObject({ state: z.literal('open') }),
  z.strictObject({ state: z.literal('sealed') }),
]);
export const arenaParticipantResultSchema = z.enum([
  'decision',
  'observe',
  'missing_material',
  'timeout',
  'invalid_output',
  'model_identity_unverified',
  'unknown_usage',
]);

export const arenaReceiptSchema = z.strictObject({ id: z.uuid(), state: arenaStateSchema });
export const arenaSummarySchema = arenaReceiptSchema.extend({
  protocol: arenaProtocolSchema,
  createdAt: z.iso.datetime(),
});
export const arenaDetailSchema = arenaSummarySchema.extend({
  remaining: arenaBudgetSchema,
  entrants: z.array(
    z.strictObject({
      id: z.uuid(),
      providerId: label,
      model: label,
      cash: z.string().regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,6})?$/),
      remaining: arenaBudgetSchema,
    }),
  ),
  rounds: z.array(
    z.strictObject({ id: z.uuid(), tradingDate: z.iso.date(), outcome: arenaRoundStateSchema }),
  ),
});

export const arenaCalendarQuerySchema = z
  .strictObject({
    market: z.enum(['CN', 'HK', 'US']),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
  })
  .refine((v) => v.startsOn <= v.endsOn, '赛期日期顺序无效');
export type ArenaCalendarQuery = z.infer<typeof arenaCalendarQuerySchema>;
export const arenaCalendarPreviewSchema = z.strictObject({
  calendarId: label,
  calendarVersion: label,
  timeZone: z.enum(['Asia/Shanghai', 'Asia/Hong_Kong', 'America/New_York']),
});
