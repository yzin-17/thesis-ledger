import { z } from 'zod';
import { marketDataRouteTargetPinV3Schema } from './market-data-wire-v3.js';
import { marketBasicLifecycleV3Schema } from './market-basic-lifecycle-v3.js';
import { type StatusCapabilityNameV1 } from './market-status-capability-id.js';
export { statusCapabilityNamesV1, type StatusCapabilityNameV1 } from './market-status-capability-id.js';

const text = z.string().min(1).refine((value) => value.trim() === value);
const date = z.iso.date();
const instant = z.iso.datetime({ offset: true });
const market = z.enum(['CN', 'HK', 'US']);
const range = z.strictObject({ start: date, end: date }).refine((value) => value.start <= value.end);
const symbol = text.regex(/^(?:[0-9]{6}\.(?:SH|SZ|BJ)|[0-9]{5}\.HK|[A-Z][A-Z0-9.-]{0,31}\.US)$/)
  .refine((value) => value !== '00000.HK');
const key = <T extends StatusCapabilityNameV1>(capability: T) => z.strictObject({
  kind: z.literal('data'), market, assetType: z.literal('STOCK'), capability: z.literal(capability),
});
const envelope = {
  contractVersion: z.literal(3), capabilityVersion: z.literal(1), consumer: z.literal('thesis-ledger'),
  requestId: text, symbol, routeTarget: marketDataRouteTargetPinV3Schema,
  policyRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
};
const identityIssue = (value: { symbol: string; routeKey: { market: string }; clock?: { timezone: string } }, context: z.RefinementCtx) => {
  const suffix = value.symbol.split('.').at(-1);
  const actual = suffix === 'HK' || suffix === 'US' ? suffix : 'CN';
  if (actual !== value.routeKey.market)
    context.addIssue({ code: 'custom', path: ['symbol'], message: '证券代码与市场不一致' });
  const timezone = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' };
  if (value.clock && value.clock.timezone !== timezone[actual])
    context.addIssue({ code: 'custom', path: ['clock'], message: '数据时区与市场不一致' });
};
const windowRequest = <T extends StatusCapabilityNameV1>(capability: T) => z.strictObject({
  ...envelope, routeKey: key(capability), range,
}).superRefine(identityIssue);
export const dailyTradingStatusRequestV1Schema = windowRequest('DAILY_TRADING_STATUS');
const riskDetail = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('coarseST') }),
  z.strictObject({ kind: z.literal('riskCategories'), categories: z.array(z.enum(['delisting', 'other'])).min(1).max(2)
    .refine((values) => new Set(values).size === values.length) }),
]);
export const riskWarningRequestV1Schema = windowRequest('RISK_WARNING').safeExtend({ detail: riskDetail });
export const dailyPriceRuleRequestV1Schema = windowRequest('DAILY_PRICE_RULE').safeExtend({ representation: z.enum(['rule', 'exactPrices']) });
export const listingPhaseRequestV1Schema = windowRequest('LISTING_PHASE');
export const securityBasicDatesRequestV1Schema = z.strictObject({
  ...envelope, routeKey: key('SECURITY_BASIC_DATES'),
}).superRefine(identityIssue);
export const statusCapabilityRequestV1Schema = z.union([
  dailyTradingStatusRequestV1Schema, riskWarningRequestV1Schema, dailyPriceRuleRequestV1Schema,
  securityBasicDatesRequestV1Schema, listingPhaseRequestV1Schema,
]);
export type StatusCapabilityRequestV1 = z.infer<typeof statusCapabilityRequestV1Schema>;

const evidence = z.strictObject({
  id: text, kind: z.enum(['document', 'record', 'calendar']),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), observedAt: instant.nullable(),
  availableAt: instant.nullable(), reference: z.url().nullable(),
  hashScope: z.enum(['originalBytes', 'normalizedResponse', 'unknown']),
}).superRefine((value, context) => {
  if ((value.sha256 === null) !== (value.hashScope === 'unknown') ||
    (value.kind !== 'document' && (value.hashScope !== 'normalizedResponse' || value.observedAt === null)) ||
    (value.kind === 'document' && (value.reference === null || value.hashScope === 'normalizedResponse')))
    context.addIssue({ code: 'custom', message: '证据摘要性质、观察时钟与原文引用不一致' });
});
const metadata = {
  provenance: z.strictObject({ adapterRevision: text, sourceRevision: text }),
  clock: z.strictObject({ observedAt: instant, upstreamAt: instant.nullable(),
    timezone: z.enum(['Asia/Shanghai', 'Asia/Hong_Kong', 'America/New_York']),
    basis: z.enum(['sessionDate', 'effectiveDate', 'unknown']),
  }),
  evidence: z.array(evidence),
};
const references = z.array(text).superRefine((values, context) => {
  if (new Set(values).size !== values.length)
    context.addIssue({ code: 'custom', message: '事实引用不得重复' });
});
const coverage = z.strictObject({
  range, expectedDates: z.array(date), calendarUnknownDates: z.array(date), unknownDates: z.array(date),
  calendarEvidenceRefs: references, complete: z.boolean(),
});
const day = { date, evidenceRefs: references };
const tradingDay = z.strictObject({
  ...day, state: z.enum(['trading', 'suspended', 'unknown']),
  intradayHalts: z.array(z.strictObject({ startedAt: instant, endedAt: instant.nullable() })
    .refine((value) => value.endedAt === null || Date.parse(value.startedAt) < Date.parse(value.endedAt))),
});
const riskDay = z.strictObject({
  ...day, coarseST: z.enum(['flagged', 'notFlagged']).nullable(),
  delisting: z.enum(['active', 'none', 'unknown']), other: z.enum(['active', 'none', 'unknown']),
});
const decimal = z.string().max(64).regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/)
  .refine((value) => /[1-9]/.test(value));
const ratio = z.string().max(64).regex(/^0\.[0-9]*[1-9][0-9]*$/);
function priceBoundsOrdered(value: { lower: string; upper: string }) {
  const [lowerInteger, lowerFraction = ''] = value.lower.split('.');
  const [upperInteger, upperFraction = ''] = value.upper.split('.');
  const scale = Math.max(lowerFraction.length, upperFraction.length);
  return BigInt(lowerInteger! + lowerFraction.padEnd(scale, '0')) <=
    BigInt(upperInteger! + upperFraction.padEnd(scale, '0'));
}
const priceRule = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unknown') }),
  z.strictObject({ kind: z.literal('ratio'), reference: z.literal('previousRawClose'),
    maxUpRatio: ratio, maxDownRatio: ratio }),
  z.strictObject({ kind: z.literal('unlimited'), reason: text }),
  z.strictObject({ kind: z.literal('exact'), currency: z.enum(['CNY', 'HKD', 'USD']),
    lower: decimal, upper: decimal }).refine(priceBoundsOrdered),
]);
const priceDay = z.strictObject({ ...day, rule: priceRule });
const phaseDay = z.strictObject({
  ...day, phase: z.enum(['unknown', 'notListed', 'initialListing', 'listed', 'delistingPeriod', 'delisted']),
});

type WindowFact = z.infer<typeof tradingDay> | z.infer<typeof riskDay> |
  z.infer<typeof priceDay> | z.infer<typeof phaseDay>;
type WindowResult = {
  symbol: string; routeKey: { market: string }; range: { start: string; end: string };
  days: WindowFact[]; coverage: z.infer<typeof coverage>;
  clock: z.infer<typeof metadata.clock>; evidence: z.infer<typeof evidence>[];
  detail?: z.infer<typeof riskDetail>; representation?: 'rule' | 'exactPrices';
};
function known(value: WindowFact) {
  if ('state' in value) return value.state !== 'unknown';
  if ('coarseST' in value) return value.coarseST !== null || value.delisting !== 'unknown' || value.other !== 'unknown';
  if ('rule' in value) return value.rule.kind !== 'unknown';
  return value.phase !== 'unknown';
}
function satisfies(value: WindowFact, request: WindowResult) {
  if ('coarseST' in value && request.detail?.kind === 'coarseST') return value.coarseST !== null;
  if ('coarseST' in value && request.detail?.kind === 'riskCategories') return request.detail.categories.every((category) => value[category] !== 'unknown');
  if ('rule' in value && request.representation === 'exactPrices') return value.rule.kind === 'exact' || value.rule.kind === 'unlimited';
  return known(value);
}
function evidenceIssues(value: Pick<WindowResult, 'clock' | 'evidence'>, context: z.RefinementCtx) {
  const ids = new Set(value.evidence.map((item) => item.id));
  if (ids.size !== value.evidence.length)
    context.addIssue({ code: 'custom', path: ['evidence'], message: '证据标识重复' });
  for (const item of value.evidence) {
    if ((item.observedAt !== null && Date.parse(item.observedAt) > Date.parse(value.clock.observedAt)) ||
      (item.availableAt !== null && Date.parse(item.availableAt) > Date.parse(value.clock.observedAt)))
      context.addIssue({ code: 'custom', path: ['evidence'], message: '证据观察时钟晚于结果观察' });
  }
  if (value.clock.upstreamAt && Date.parse(value.clock.upstreamAt) > Date.parse(value.clock.observedAt))
    context.addIssue({ code: 'custom', path: ['clock'], message: '上游时钟晚于结果观察' });
}
function requiresDocument(value: WindowFact) {
  if ('rule' in value) return value.rule.kind !== 'unknown';
  if ('phase' in value) return value.phase !== 'unknown';
  if ('delisting' in value) return value.delisting !== 'unknown' || value.other !== 'unknown';
  return value.intradayHalts.length > 0;
}
function factEvidenceIssues(value: WindowResult, context: z.RefinementCtx) {
  const evidenceById = new Map(value.evidence.map((item) => [item.id, item]));
  for (const item of value.days) {
    const precise = requiresDocument(item);
    if (item.evidenceRefs.some((id) => !evidenceById.has(id)) ||
      ((known(item) || precise) && !item.evidenceRefs.length) ||
      (precise && !item.evidenceRefs.some((id) => evidenceById.get(id)?.kind === 'document')))
      context.addIssue({ code: 'custom', path: ['days'], message: '已知事实缺少对应证据或精细规则原文' });
  }
}
function windowIssues(value: WindowResult, context: z.RefinementCtx) {
  identityIssue(value, context);
  evidenceIssues(value, context);
  factEvidenceIssues(value, context);
  const { start, end } = value.range;
  const evidenceById = new Map(value.evidence.map((item) => [item.id, item]));
  const byDate = new Map(value.days.map((item) => [item.date, item]));
  if (value.coverage.range.start !== start || value.coverage.range.end !== end)
    context.addIssue({ code: 'custom', path: ['coverage'], message: '覆盖窗口与请求不一致' });
  for (const dates of [value.days.map((item) => item.date), value.coverage.expectedDates,
    value.coverage.calendarUnknownDates, value.coverage.unknownDates]) {
    if (dates.some((item, index) => item < start || item > end || (index > 0 && item <= dates[index - 1]!)))
      context.addIssue({ code: 'custom', path: ['coverage'], message: '日期越界、重复或乱序' });
  }
  const unknown = value.coverage.expectedDates.filter((item) => !byDate.has(item) || !satisfies(byDate.get(item)!, value));
  const calendars = value.coverage.calendarEvidenceRefs;
  const complete = calendars.length > 0 && !value.coverage.calendarUnknownDates.length && !unknown.length;
  if (value.coverage.calendarUnknownDates.some((item) => value.coverage.expectedDates.includes(item)) ||
    calendars.some((id) => evidenceById.get(id)?.kind !== 'calendar') ||
    JSON.stringify(unknown) !== JSON.stringify(value.coverage.unknownDates) || complete !== value.coverage.complete)
    context.addIssue({ code: 'custom', path: ['coverage'], message: '覆盖声明与未知日期或日历证据不一致' });
}
export const dailyTradingStatusResultV1Schema = dailyTradingStatusRequestV1Schema.safeExtend({
  ...metadata, days: z.array(tradingDay), coverage,
}).superRefine(windowIssues);
export const riskWarningResultV1Schema = riskWarningRequestV1Schema.safeExtend({
  ...metadata, days: z.array(riskDay), coverage,
}).superRefine(windowIssues);
export const dailyPriceRuleResultV1Schema = dailyPriceRuleRequestV1Schema.safeExtend({
  ...metadata, days: z.array(priceDay), coverage,
}).superRefine(windowIssues);
export const listingPhaseResultV1Schema = listingPhaseRequestV1Schema.safeExtend({
  ...metadata, days: z.array(phaseDay), coverage,
}).superRefine(windowIssues);
export const securityBasicDatesResultV1Schema = securityBasicDatesRequestV1Schema.safeExtend({
  ...metadata, dates: marketBasicLifecycleV3Schema,
}).superRefine((value, context) => {
  evidenceIssues(value, context);
  if (value.dates.sourceRecordId && !value.evidence.some((item) =>
    item.id === value.dates.sourceRecordId && item.kind === 'record'))
    context.addIssue({ code: 'custom', path: ['dates'], message: '基础日期缺少独立结构化原始记录' });
});
export const statusCapabilityResultV1Schema = z.union([
  dailyTradingStatusResultV1Schema, riskWarningResultV1Schema, dailyPriceRuleResultV1Schema,
  securityBasicDatesResultV1Schema, listingPhaseResultV1Schema,
]);
export type StatusCapabilityResultV1 = z.infer<typeof statusCapabilityResultV1Schema>;

function requestIdentity(value: StatusCapabilityRequestV1) {
  const range = 'range' in value ? [value.range.start, value.range.end] : null;
  const detail = 'detail' in value ? value.detail : null;
  const representation = 'representation' in value ? value.representation : null;
  return JSON.stringify([value.requestId, value.symbol, value.policyRevision,
    value.routeKey.kind, value.routeKey.market, value.routeKey.assetType, value.routeKey.capability,
    value.routeTarget.providerId, value.routeTarget.upstreamSource, value.routeTarget.routeIndex,
    range, detail, representation]);
}
export function correlateStatusCapabilityV1(request: StatusCapabilityRequestV1, result: unknown) {
  const value = statusCapabilityResultV1Schema.parse(result);
  if (requestIdentity(request) !== requestIdentity(value))
    throw new Error('功能请求与结果身份、窗口、政策代次或目标不一致');
  return value;
}
