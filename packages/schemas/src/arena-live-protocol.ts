import { z } from 'zod';
import { arenaProtocolSchema } from './model-arena.js';
import { currencyForMarket } from './backtest-values.js';
import { arenaLiveBudgetSchema } from './arena-live-budget.js';
import { arenaExitQuantitySchema, arenaTrailingStopSchema } from './arena-live-protection-input.js';

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
  simulationPolicy: z.literal('sampled-v1').optional().describe('统一研究账户规则：配置费用、内地隔日可卖、卖款当日可再投资。'),
  matching: z.strictObject({
    kind: z.literal('simulated_volume'),
    maxSharesPerObservation: arenaPositiveDecimalSchema,
  }).optional().describe('显式模拟上限：每份新行情按账户和标的共享股数额度，按手数向下取整；未设置时整笔成交。不是订单簿流动性。'),
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
const arenaOrderInputBaseSchema = z.strictObject({
  clientId: label,
  symbol: label,
  side: z.enum(['buy', 'sell']),
  kind: z.enum(['market', 'limit', 'stop_loss', 'take_profit']),
  quantity: arenaPositiveDecimalSchema,
  price: arenaPositiveDecimalSchema.nullable(),
  expiresOn: z.iso.date().nullable()
    .describe('委托到期交易日，按比赛市场时区填写 YYYY-MM-DD 日期或 null；市价委托必须为 null。此字段不填写时分秒或时区，具体观察时刻由 wakeups.at 指定。'),
  exitGroup: label.nullable(),
  entryAfter: z.strictObject({ clientId: label, activation: z.literal('on_full_fill') }).nullable().optional(),
  onFill: z.strictObject({
    activation: z.enum(['on_full_fill', 'on_each_fill']).describe('全成后激活或每次成交即按量激活；两者都可用于staged分档退出。'),
    afterExit: z.enum(['cancel_entry_remainder', 'keep_entry_remainder']).optional(),
    exitPolicy: z.enum(['single', 'oco', 'staged']).optional().describe('single为单一止损，oco为首次成交互斥两腿，staged为分档止盈后保留余仓止损；staged各子单exitGroup均为null，止盈数量使用parent_filled_fraction。'),
    activateOrders: z.array(z.strictObject({
      clientId: label,
      side: z.literal('sell'),
      kind: z.enum(['stop_loss', 'take_profit']),
      exitGroup: label.nullable().optional(),
      price: arenaPositiveDecimalSchema,
      quantity: arenaExitQuantitySchema,
      trailing: arenaTrailingStopSchema.nullable().optional(),
      reduceOnly: z.literal(true),
      validUntil: z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('activation_session_close') }),
        z.strictObject({ kind: z.literal('date'), expiresOn: z.iso.date() }),
      ]),
    })).min(1).max(11),
  }).nullable().optional().describe('买入父单可附单一止损、同组OCO或显式staged退出；分档退出可全成或逐次激活，额度按本批累计实际成交量乘比例、按手数向下取整，再扣除本档累计已退出量；余仓由止损覆盖。逐次保护必须声明退出后如何处理入场余量。'),
});
export const arenaOrderInputSchema = arenaOrderInputBaseSchema.superRefine((o, ctx) => {
  if (o.onFill && o.side !== 'buy')
    ctx.addIssue({ code: 'custom', path: ['onFill'], message: '成交保护只能附属于买入父单' });
  if (o.onFill) validateArenaFillProtection(o.onFill, ctx);
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
  orders: z.array(arenaOrderInputSchema).max(100).describe('仅填写本次新增委托。保留账户已有委托不需要重复列出；只撤单时填写空数组。'),
  cancelOrderIds: z.array(z.uuid()).max(100).describe('明确撤销的已有订单id；撤入场余量和撤保护分别使用对应订单id，不能通过重建整份已有计划来撤单。'),
  wakeups: z.array(arenaWakeupInputSchema).min(1).max(100),
  watchedSymbols: z.array(label).max(200),
}).superRefine((d, ctx) => {
  const ids = d.orders.flatMap((o) => [o.clientId, ...(o.onFill?.activateOrders.map((child) => child.clientId) ?? [])]);
  if (new Set(ids).size !== ids.length)
    ctx.addIssue({ code: 'custom', path: ['orders'], message: '委托标识重复' });
  const groups = new Map<string, typeof d.orders>();
  for (const [index, order] of d.orders.entries()) if (order.entryAfter) {
    const previous = d.orders.slice(0, index).find(o => o.clientId === order.entryAfter!.clientId);
    if (order.side !== 'buy' || previous?.side !== 'buy')
      ctx.addIssue({ code: 'custom', path: ['orders', index, 'entryAfter'], message: '顺序建仓须引用本次决策中更早的买入委托' });
  }
  const attachedGroups = d.orders.flatMap(o => o.onFill?.activateOrders[0]?.exitGroup ? [o.onFill.activateOrders[0].exitGroup] : []);
  if (new Set(attachedGroups).size !== attachedGroups.length || d.orders.some(o => o.exitGroup && attachedGroups.includes(o.exitGroup)))
    ctx.addIssue({ code: 'custom', path: ['orders'], message: '附属退出组须独立属于一个父单' });
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

type ArenaFillProtection = NonNullable<z.infer<typeof arenaOrderInputBaseSchema>['onFill']>;

function validateArenaFillProtection(protection: ArenaFillProtection, ctx: z.RefinementCtx) {
  const legs = protection.activateOrders;
  const validSingle = legs.length === 1 && legs[0]!.kind === 'stop_loss' && !legs[0]!.exitGroup && legs[0]!.quantity.basis === 'parent_open_quantity';
  const validPair = isProtectionPair(legs);
  const staged = isStagedProtection(protection);
  const single = (!protection.exitPolicy || protection.exitPolicy === 'single') && validSingle;
  const pair = (!protection.exitPolicy || protection.exitPolicy === 'oco') && validPair;
  if (!(staged || single || pair))
    ctx.addIssue({ code: 'custom', path: ['onFill', 'activateOrders'], message: '附属退出须为单一止损、同组同期限的止盈止损，或余仓止损加比例止盈档位' });
  if (legs.some(l => l.trailing && l.kind !== 'stop_loss'))
    ctx.addIssue({ code: 'custom', path: ['onFill', 'activateOrders'], message: '移动保护只用于止损腿' });
  // 使用整数比例交叉相乘，避免小数舍入使累计退出比例超过一。
  let numerator = 0n, denominator = 1n;
  for (const leg of legs) if (leg.quantity.basis === 'parent_filled_fraction') {
    numerator = numerator * BigInt(leg.quantity.denominator) + BigInt(leg.quantity.numerator) * denominator;
    denominator *= BigInt(leg.quantity.denominator);
  }
  if (numerator > denominator)
    ctx.addIssue({ code: 'custom', path: ['onFill', 'activateOrders'], message: '分档退出比例之和不得超过本批成交量' });
  if (protection.activation === 'on_each_fill' && !protection.afterExit)
    ctx.addIssue({ code: 'custom', path: ['onFill', 'afterExit'], message: '逐次保护须明确退出后如何处理入场余量' });
}

function isProtectionPair(legs: ArenaFillProtection['activateOrders']) {
  return legs.length === 2 && new Set(legs.map((leg) => leg.kind)).size === 2 &&
    !!legs[0]!.exitGroup && legs[0]!.exitGroup === legs[1]!.exitGroup &&
    JSON.stringify(legs[0]!.validUntil) === JSON.stringify(legs[1]!.validUntil) && legs.every(l => l.quantity.basis === 'parent_open_quantity');
}

function isStagedProtection(protection: ArenaFillProtection) {
  const legs = protection.activateOrders;
  return protection.exitPolicy === 'staged' && legs.length >= 2 &&
    legs.filter(l => l.kind === 'stop_loss').length === 1 && legs.every(l => !l.exitGroup &&
      (l.kind === 'stop_loss' ? l.quantity.basis === 'parent_open_quantity' : l.quantity.basis === 'parent_filled_fraction'));
}
