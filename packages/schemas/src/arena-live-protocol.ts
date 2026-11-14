import { z } from 'zod';
import { arenaProtocolSchema } from './model-arena.js';
import { currencyForMarket } from './backtest-values.js';
import { arenaLiveBudgetSchema } from './arena-live-budget.js';

export const arenaDecimalSchema = z.string().regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,40})?$/);
export const arenaPositiveDecimalSchema = arenaDecimalSchema.refine((v) => /[1-9]/.test(v), '数值须大于零');
const label = z.string().trim().min(1).max(200);
export const arenaLiveDefaults = {
  title: '自主模型比赛', initialCash: '100000', maxPositionBps: 5000,
  fees: { version: 'fixed-v1', buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
  resources: { maxActiveSymbols: 50, maxResearchSteps: null, maxCycleSeconds: null, quoteIntervalSeconds: 30, maxQuoteAgeSeconds: 60 },
} as const;
const entrant = arenaProtocolSchema.shape.entrants.element;
export const arenaLiveProtocolSchema = z.strictObject({
  ...arenaProtocolSchema.shape,
  version: z.literal(2),
  title: label.default(arenaLiveDefaults.title),
  initialCash: arenaProtocolSchema.shape.initialCash.default(arenaLiveDefaults.initialCash),
  maxPositionBps: arenaProtocolSchema.shape.maxPositionBps.default(arenaLiveDefaults.maxPositionBps),
  fees: arenaProtocolSchema.shape.fees.extend({
    version: arenaProtocolSchema.shape.fees.shape.version.default(arenaLiveDefaults.fees.version),
    buyBps: arenaProtocolSchema.shape.fees.shape.buyBps.default(0),
    sellBps: arenaProtocolSchema.shape.fees.shape.sellBps.default(0),
    minimum: arenaProtocolSchema.shape.fees.shape.minimum.default('0'),
    slippageBps: arenaProtocolSchema.shape.fees.shape.slippageBps.default(0),
  }).prefault({}),
  budget: arenaLiveBudgetSchema,
  entrants: z.array(entrant.extend({ budget: arenaLiveBudgetSchema,
    maxInputTokens: entrant.shape.maxInputTokens.nullable().default(null),
    maxOutputTokens: entrant.shape.maxOutputTokens.nullable().default(null),
  })).min(1).max(12),
  startsOn: z.iso.date().nullable().default(null),
  endsOn: z.iso.date().nullable().default(null),
  calendarVersion: z.string().min(1).nullable().default(null),
  decisionDeadlineMinutes: arenaProtocolSchema.shape.decisionDeadlineMinutes.nullable().default(null),
  universe: z.enum(['fixed', 'market']),
  instruments: z.array(arenaProtocolSchema.shape.instruments.element).max(50).default([]),
  allowWebSearch: z.boolean().default(false),
  budgetCurrency: arenaProtocolSchema.shape.budgetCurrency.default('USD'),
  benchmarks: z.array(z.enum(['cash', 'equal_weight_buy_hold'])).min(1),
  resources: z.strictObject({
    maxActiveSymbols: z.number().int().min(1).max(200).default(arenaLiveDefaults.resources.maxActiveSymbols),
    maxResearchSteps: z.number().int().min(1).max(100).nullable().default(null),
    maxCycleSeconds: z.number().int().min(30).max(1800).nullable().default(null),
    quoteIntervalSeconds: z.number().int().min(15).max(300).default(arenaLiveDefaults.resources.quoteIntervalSeconds),
    maxQuoteAgeSeconds: z.number().int().min(15).max(300).default(arenaLiveDefaults.resources.maxQuoteAgeSeconds),
  }).prefault({}),
}).superRefine((p, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (p.startsOn && p.endsOn && p.startsOn > p.endsOn) issue('endsOn', '赛期结束早于开始');
  if (p.currency !== currencyForMarket[p.market]) issue('currency', '币种与市场不匹配');
  const zones = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' };
  if (p.timeZone !== zones[p.market]) issue('timeZone', '时区与市场不匹配');
  if (p.universe === 'fixed' && !p.instruments.length) issue('instruments', '请选择参赛标的');
  if (p.universe === 'market' && p.benchmarks.includes('equal_weight_buy_hold'))
    issue('benchmarks', '全市场选股使用现金基准');
  const suffix = p.market === 'CN' ? /\.(SH|SZ|BJ)$/ : new RegExp('\\.' + p.market + '$');
  if (p.instruments.some((i) => !suffix.test(i.symbol))) issue('instruments', '参赛标的限同一市场');
  const bindings = p.entrants.map((e) => JSON.stringify([e.providerId, e.model]));
  if (new Set(bindings).size !== bindings.length) issue('entrants', '参赛模型绑定重复');
  if (new Set(p.instruments.map((i) => i.symbol)).size !== p.instruments.length)
    issue('instruments', '参赛标的重复');
  if (p.instruments.length > p.resources.maxActiveSymbols) issue('instruments', '标的数量超过监测额度');
  if (new Set(p.entrants.map((e) => JSON.stringify(e.budget))).size !== 1)
    issue('entrants', '同场参赛模型须采用相同预算上限');
});
export type ArenaLiveProtocol = z.infer<typeof arenaLiveProtocolSchema>;

export const arenaWakeupInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('time'), at: z.iso.datetime()
    .describe('下一次观察的未来 UTC 时刻，使用以 Z 结尾的 ISO 日期时间；交易日使用委托 expiresOn 字段。') }),
  z.strictObject({
    kind: z.literal('price'), symbol: label, operator: z.enum(['gte', 'lte']),
    price: arenaPositiveDecimalSchema,
  }),
  z.strictObject({ kind: z.literal('fill'), symbol: label.nullable() }),
]);
export const arenaOrderInputSchema = z.strictObject({
  clientId: label,
  symbol: label,
  side: z.enum(['buy', 'sell']),
  kind: z.enum(['market', 'limit', 'stop_loss', 'take_profit']),
  quantity: arenaPositiveDecimalSchema,
  price: arenaPositiveDecimalSchema.nullable(),
  expiresOn: z.iso.date().nullable()
    .describe('委托到期交易日，按比赛市场时区填写 YYYY-MM-DD 日期或 null；市价委托必须为 null。此字段不填写时分秒或时区，具体观察时刻由 wakeups.at 指定。'),
  exitGroup: label.nullable(),
}).superRefine((o, ctx) => {
  if (o.kind === 'market' && o.expiresOn !== null)
    ctx.addIssue({ code: 'custom', path: ['expiresOn'], message: '市价委托只在当前会话有效，不指定到期日' });
  if (o.kind !== 'market' && o.price === null)
    ctx.addIssue({ code: 'custom', path: ['price'], message: '请提供委托价格' });
  if (['stop_loss', 'take_profit'].includes(o.kind) && o.side !== 'sell')
    ctx.addIssue({ code: 'custom', path: ['side'], message: '退出委托只用于卖出持仓' });
  if (o.exitGroup && !['stop_loss', 'take_profit'].includes(o.kind))
    ctx.addIssue({ code: 'custom', path: ['exitGroup'], message: '配对退出只用于止盈止损' });
});
export const arenaLiveDecisionSchema = z.strictObject({
  summary: z.string().trim().min(1).max(8000),
  orders: z.array(arenaOrderInputSchema).max(100),
  cancelOrderIds: z.array(z.uuid()).max(100),
  wakeups: z.array(arenaWakeupInputSchema).min(1).max(100),
  watchedSymbols: z.array(label).max(200),
}).superRefine((d, ctx) => {
  if (new Set(d.orders.map((o) => o.clientId)).size !== d.orders.length)
    ctx.addIssue({ code: 'custom', path: ['orders'], message: '委托标识重复' });
  const groups = new Map<string, typeof d.orders>();
  for (const order of d.orders) {
    if (order.exitGroup) groups.set(order.exitGroup, [...(groups.get(order.exitGroup) ?? []), order]);
  }
  for (const orders of groups.values()) {
    if (orders.length !== 2 || new Set(orders.map((o) => o.kind)).size !== 2 ||
      new Set(orders.map((o) => o.symbol)).size !== 1 ||
      new Set(orders.map((o) => o.quantity)).size !== 1)
      ctx.addIssue({ code: 'custom', path: ['orders'], message: '成对退出须为同标的同数量的止盈与止损' });
  }
});
export type ArenaLiveDecision = z.infer<typeof arenaLiveDecisionSchema>;
export type ArenaOrderInput = z.infer<typeof arenaOrderInputSchema>;
export type ArenaWakeupInput = z.infer<typeof arenaWakeupInputSchema>;
