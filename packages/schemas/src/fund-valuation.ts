import { z } from 'zod';

export const fundValuationSymbolSchema = z.string().regex(/^\d{6}\.OF$/);
export const fundValuationReasonSchema = z.enum([
  'market_closed', 'nav_unavailable', 'disclosure_unavailable',
  'prices_unavailable', 'source_unavailable', 'low_coverage', 'partial_coverage',
  'currency_unverified', 'currency_unsupported',
]);
export const fundValuationSchema = z.strictObject({
  version: z.literal(1),
  symbol: fundValuationSymbolSchema,
  marketState: z.enum(['open', 'closed']),
  quality: z.enum(['complete', 'partial', 'low_coverage', 'unavailable']),
  estimatedNav: z.number().finite().positive().nullable(),
  changePercent: z.number().finite().nullable(),
  anchor: z.strictObject({ unitNav: z.number().positive(), navDate: z.iso.datetime({ offset: true }) }).nullable(),
  estimatedAt: z.iso.datetime({ offset: true }).nullable(),
  oldestPriceAt: z.iso.datetime({ offset: true }).nullable(),
  disclosureCoverage: z.number().min(0).max(1),
  pricedCoverage: z.number().min(0).max(1),
  reasons: z.array(fundValuationReasonSchema),
  method: z.literal('disclosed-holdings-qfq-v1'),
}).superRefine((value, context) => {
  const unavailable = value.quality === 'unavailable';
  if (unavailable !== (value.estimatedNav === null) || unavailable !== (value.changePercent === null))
    context.addIssue({ code: 'custom', message: '估值可用性与数值不一致' });
  if (!unavailable && (!value.anchor || !value.estimatedAt || !value.oldestPriceAt || value.pricedCoverage === 0))
    context.addIssue({ code: 'custom', message: '可用估值缺少价格时间或锚点证据' });
  if (value.pricedCoverage > value.disclosureCoverage + 0.000001)
    context.addIssue({ code: 'custom', message: '定价覆盖不能超过披露覆盖' });
  if (unavailable && value.reasons.length === 0)
    context.addIssue({ code: 'custom', message: '不可用估值必须保留原因' });
});
export const fundDailyErrorSchema = z.object({
  symbol: fundValuationSymbolSchema, day: z.iso.date(), method: z.literal('disclosed-holdings-qfq-v1'),
  estimatedAt: z.iso.datetime({offset:true}), estimatedNav: z.number().positive(),
  pricedCoverage: z.number().min(0).max(1), quality: z.enum(['low_coverage','partial','complete']),
  official: z.object({ unitNav:z.number().positive(), navDate:z.iso.datetime({offset:true}), provider:z.string(),
    upstreamSource:z.string(), fetchedAt:z.iso.datetime({offset:true}), servedFromCache:z.boolean() }).nullable(),
  errors:z.object({signed:z.string(),absolute:z.string(),relativeAbsolute:z.string()}).nullable(),
}).nullable();
export type FundValuation = z.infer<typeof fundValuationSchema>;

export const fundValuationTodaySchema = z.strictObject({
  version: z.literal(1),
  symbol: fundValuationSymbolSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.literal('Asia/Shanghai'),
  asOf: z.iso.datetime({ offset: true }),
  points: z.array(z.strictObject({ at: z.iso.datetime({ offset: true }), valuation: fundValuationSchema })).max(1440),
}).superRefine((value, context) => {
  const dateOf = (at: string) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(at));
  if (dateOf(value.asOf) !== value.date)
    context.addIssue({ code: 'custom', message: '今日序列日期与查询时点不一致' });
  let previous = -Infinity;
  for (const point of value.points) {
    const time = Date.parse(point.at);
    if (point.valuation.symbol !== value.symbol || dateOf(point.at) !== value.date ||
        time <= previous || time > Date.parse(value.asOf) || time % 60_000 !== 0)
      context.addIssue({ code: 'custom', message: '基金分钟点身份、日期或顺序不一致' });
    if (point.valuation.estimatedAt &&
        (Math.floor(Date.parse(point.valuation.estimatedAt) / 60_000) !== time / 60_000 ||
         Date.parse(point.valuation.estimatedAt) > Date.parse(value.asOf)))
      context.addIssue({ code: 'custom', message: '基金分钟估值时间与记录不一致' });
    previous = time;
  }
});
export type FundValuationToday = z.infer<typeof fundValuationTodaySchema>;
