import { z } from 'zod';

const text = z.string().min(1).refine(v => v.trim() === v);
const instant = z.iso.datetime({ offset: true });
const day = z.iso.date();
const refs = z.array(text).min(1).max(32).refine(v => new Set(v).size === v.length);
const original = { id: text, sha256: z.string().regex(/^[a-f0-9]{64}$/), reference: z.url(), observedAt: instant };
export const historicalExecutionEvidenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...original, kind: z.enum(['snapshot', 'rule']), availableAt: instant }),
  z.strictObject({ ...original, kind: z.literal('reconstruction'), httpStatus: z.literal(200) }),
]);
const state = {
  state: z.enum(['trading', 'suspended']),
  intradayHalts: z.array(z.strictObject({ startedAt: instant, endedAt: instant.nullable() })).max(256),
  evidenceRefs: refs,
};
export const historicalTradingSchema = z.union([
  z.strictObject({ ...state, basis: z.strictObject({
    method: z.literal('sse-fund-halts-v1'),
    listing: z.strictObject({ listedOn: day, delistedOn: day.nullable(), evidenceRefs: refs }),
    session: z.strictObject({ startAt: instant, endAt: instant, evidenceRefs: refs }),
    query: z.strictObject({ symbol: text, day, pages: z.number().int().min(1).max(256),
      total: z.number().int().min(0).max(100000), evidenceRefs: refs }),
  }) }),
  z.strictObject(state),
]);
type Evidence = z.infer<typeof historicalExecutionEvidenceSchema>;
type Trading = z.infer<typeof historicalTradingSchema>;
export function validateHistoricalTrading(value: {
  asOf: string; fact: { symbol: string; instrumentType: string }; trading: Trading;
  evidence: Evidence[]; ruleEvidenceRefs: string[];
}, fail: (message: string) => void) {
  const at = Date.parse(value.asOf), trading = value.trading;
  const byId = new Map(value.evidence.map(e => [e.id, e]));
  const basis = 'basis' in trading ? trading.basis : undefined;
  for (const e of value.evidence) {
    if (e.kind === 'reconstruction') {
      if (Date.parse(e.observedAt) < at) fail('历史重建查询不能早于所重建时刻');
    } else if (Date.parse(e.availableAt) > at || Date.parse(e.observedAt) < Date.parse(e.availableAt))
      fail('执行证据未在模拟时刻可见或采集时钟倒置');
  }
  const check = (ids: string[], kinds: Evidence['kind'][]) => {
    if (ids.some(id => !kinds.includes(byId.get(id)?.kind as Evidence['kind'])))
      fail('执行证据引用缺失或种类不符');
  };
  check(trading.evidenceRefs, [basis ? 'reconstruction' : 'snapshot']);
  check(value.ruleEvidenceRefs, ['rule']);
  if (!basis) {
    if (value.evidence.some(e => e.kind === 'reconstruction')) fail('历史重建证据缺少推导依据');
    return;
  }
  if (!Number.isFinite(at)) { fail('历史重建时刻无效'); return; }
  const date = new Date(at + 8 * 3600000).toISOString().slice(0, 10);
  const { listing, session, query } = basis;
  if (listing.listedOn > date || listing.delistedOn !== null && listing.delistedOn <= date)
    fail('目标证券不在上市存续期');
  // 区间结束标记的收盘分钟仍有证券状态；消费者单独判断新订单会话。
  if (!(Date.parse(session.startAt) <= at && at <= Date.parse(session.endAt)) ||
    new Date(Date.parse(session.startAt) + 8 * 3600000).toISOString().slice(0, 10) !== date ||
    new Date(Date.parse(session.endAt) + 8 * 3600000).toISOString().slice(0, 10) !== date)
    fail('目标时刻不在交易会话');
  if (query.symbol !== value.fact.symbol || query.day !== date || query.pages !== query.evidenceRefs.length ||
    query.evidenceRefs.length !== trading.evidenceRefs.length ||
    query.evidenceRefs.some(id => !trading.evidenceRefs.includes(id)))
    fail('历史查询与证券、日期或分页不符');
  if (value.fact.instrumentType !== 'ETF' || !value.fact.symbol.endsWith('.SH'))
    fail('基金停复牌重建只适用于上交所 ETF');
  check(listing.evidenceRefs, ['snapshot', 'rule']);
  check(session.evidenceRefs, ['snapshot', 'rule']);
  const active = trading.intradayHalts.some(h => Date.parse(h.startedAt) <= at &&
    (h.endedAt === null || at < Date.parse(h.endedAt)));
  if (trading.state !== (active ? 'suspended' : 'trading')) fail('重建状态与停牌区间矛盾');
}
