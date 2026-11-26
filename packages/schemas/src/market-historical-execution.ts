import { z } from 'zod';
import { instrumentFactSchema } from './backtest-data.js';
import { historicalExecutionEvidenceSchema, historicalTradingSchema, validateHistoricalTrading } from './market-historical-trading.js';

const text = z.string().min(1).refine(v => v.trim() === v);
const instant = z.iso.datetime({ offset: true });
const amount = z.string().max(64).regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const scaled = (value: string) => {
  const [integer, fraction = ''] = value.split('.');
  return BigInt(integer! + fraction.padEnd(64, '0'));
};
export const historicalExecutionCapability = 'HISTORICAL_EXECUTION_CONTEXT' as const;
export const historicalExecutionRequestSchema = z.strictObject({
  contractVersion: z.literal(1), consumer: z.literal('thesis-ledger'), requestId: text,
  routeKey: z.strictObject({ kind: z.literal('data'), market: z.literal('CN'),
    assetType: z.enum(['STOCK', 'ETF']), capability: z.literal(historicalExecutionCapability) }),
  routeTarget: z.strictObject({ providerId: text, upstreamSource: text, routeIndex: z.number().int().min(0).max(1) }),
  policyRevision: z.number().int().positive(),
  symbol: z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/), asOf: instant,
  purpose: z.enum(['full', 'sampled']).default('full'),
});
export type HistoricalExecutionRequest = z.infer<typeof historicalExecutionRequestSchema>;

const refs = z.array(text).min(1).max(32).refine(v => new Set(v).size === v.length);
export const historicalExecutionContextSchema = z.strictObject({
  asOf: instant,
  fact: instrumentFactSchema.strict(),
  trading: historicalTradingSchema,
  priceRule: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('exact'), currency: z.literal('CNY'), lower: amount, upper: amount }),
    z.strictObject({ kind: z.literal('unlimited'), reason: text }),
  ]),
  ruleEvidenceRefs: refs,
  ruleCoverage: z.strictObject({ quantity: z.literal(true), price: z.literal(true),
    positionSettlement: z.literal(true), cashSettlement: z.literal(true), statutoryCharges: z.literal(true) }),
  evidence: z.array(historicalExecutionEvidenceSchema).min(2).max(32),
}).superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const at = Date.parse(value.asOf);
  if (!Number.isFinite(at)) { fail('执行时点无效'); return; }
  const day = new Date(at + 8 * 3600000).toISOString().slice(0, 10);
  const fact = value.fact, rule = fact.executionRules;
  if (fact.market !== 'CN' || fact.currency !== 'CNY' || !['STOCK', 'ETF'].includes(fact.instrumentType) ||
    !fact.tradable || !fact.lotSize || !fact.tickSize || Date.parse(fact.availableAt) > at ||
    Date.parse(fact.occurredAt) > at || rule.status !== 'supported' || rule.range.start > day ||
    rule.range.end < day || rule.range.start > rule.range.end || rule.cashSettlement.buyDebitAfterTradingDays !== 0)
    fail('执行身份、可见时刻或制度覆盖不完整');
  if (rule.status === 'supported' && (rule.statutoryCharges.length > 64 ||
    new Set(rule.statutoryCharges.map(c => `${c.code}:${c.side}`)).size !== rule.statutoryCharges.length))
    fail('执行收费项目重复');
  const byId = new Map(value.evidence.map(e => [e.id, e]));
  if (byId.size !== value.evidence.length) fail('执行证据标识重复');
  validateHistoricalTrading(value, fail);
  for (const h of value.trading.intradayHalts)
    if (Date.parse(h.startedAt) > at || h.endedAt !== null &&
      (Date.parse(h.endedAt) <= Date.parse(h.startedAt) || Date.parse(h.endedAt) > at)) fail('停牌区间含未来或倒置事实');
  if (value.priceRule.kind === 'exact' && amount.safeParse(value.priceRule.lower).success &&
    amount.safeParse(value.priceRule.upper).success && (scaled(value.priceRule.lower) <= 0n ||
    scaled(value.priceRule.lower) > scaled(value.priceRule.upper)))
    fail('历史价格限制无效');
});
export const sampledHistoricalExecutionContextSchema = z.strictObject({
  asOf: instant,
  fact: z.strictObject({
    symbol: text, market: z.literal('CN'), instrumentType: z.enum(['STOCK', 'ETF']),
    currency: z.literal('CNY'), lotSize: amount, tickSize: amount,
    provider: text, providerRevision: text, occurredAt: instant, availableAt: instant,
  }),
  trading: historicalTradingSchema,
  identityEvidenceRefs: refs,
  evidence: z.array(historicalExecutionEvidenceSchema).min(1).max(32),
}).superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const at = Date.parse(value.asOf), fact = value.fact;
  if (!amount.safeParse(fact.lotSize).success || !amount.safeParse(fact.tickSize).success ||
    Date.parse(fact.availableAt) > at || Date.parse(fact.occurredAt) > at ||
    scaled(fact.lotSize) <= 0n || scaled(fact.tickSize) <= 0n)
    fail('采样身份、可见时刻或交易单位无效');
  const byId = new Map(value.evidence.map(e => [e.id, e]));
  if (byId.size !== value.evidence.length || value.identityEvidenceRefs.some(id =>
    !['snapshot', 'rule'].includes(byId.get(id)?.kind ?? '')))
    fail('采样身份证据缺失、重复或种类不符');
  validateHistoricalTrading(value, fail);
  for (const h of value.trading.intradayHalts)
    if (Date.parse(h.startedAt) > at || h.endedAt !== null &&
      (Date.parse(h.endedAt) <= Date.parse(h.startedAt) || Date.parse(h.endedAt) > at))
      fail('停牌区间含未来或倒置事实');
});
export type SampledHistoricalExecutionContext = z.infer<typeof sampledHistoricalExecutionContextSchema>;

export const historicalExecutionResultSchema = historicalExecutionRequestSchema.extend({
  context: z.union([historicalExecutionContextSchema, sampledHistoricalExecutionContextSchema]),
}).superRefine((v, ctx) => {
  if ((v.purpose === 'sampled') !== ('identityEvidenceRefs' in v.context))
    ctx.addIssue({ code: 'custom', message: '历史执行用途与上下文不一致' });
  if (Date.parse(v.context.asOf) !== Date.parse(v.asOf) || v.context.fact.symbol !== v.symbol ||
    v.context.fact.instrumentType !== v.routeKey.assetType || v.context.fact.provider !== v.routeTarget.providerId)
    ctx.addIssue({ code: 'custom', message: '执行事实与精确请求不符' });
});
export type HistoricalExecutionContext = z.infer<typeof historicalExecutionContextSchema>;

export function correlateHistoricalExecution(request: HistoricalExecutionRequest, raw: unknown) {
  const result = historicalExecutionResultSchema.parse(raw);
  const envelope = historicalExecutionRequestSchema.strip().parse(result);
  if (JSON.stringify(envelope) !== JSON.stringify(request))
    throw new Error('历史执行响应与请求不符');
  return result;
}
