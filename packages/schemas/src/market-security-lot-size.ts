import { z } from 'zod';

export const securityLotSharesSchema = z.string().regex(/^[1-9]\d*$/, '每手股数必须为正整数').max(15);
export const securityLotSymbolSchema = z.string().trim().toUpperCase().regex(/^\d{1,5}\.HK$/)
  .refine(value => Number(value.slice(0, -3)) > 0, '港股代码无效')
  .transform(value => value.slice(0, -3).padStart(5, '0') + '.HK');

/** 公开参考引用与标准化观察摘要；不包含 OpenD 地址或账户凭证。 */
export const securityLotSourceSchema = z.strictObject({
  symbol: securityLotSymbolSchema.optional(),
  provider: z.string().trim().min(1),
  sourceUrl: z.url().refine(value => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
        ![...url.searchParams.keys()].some(key => /token|secret|password|credential|auth|api[-_]?key|signature/iu.test(key));
    } catch { return false; }
  }, '每手来源引用必须为不含凭据的公开HTTP地址'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  observedAt: z.iso.datetime({ offset: true }),
});

export const securityLotReferenceSchema = z.strictObject({
  symbol: securityLotSymbolSchema,
  sharesPerLot: securityLotSharesSchema,
  historicalChanges: z.literal('unverified'),
  source: securityLotSourceSchema,
});
export type SecurityLotReference = z.infer<typeof securityLotReferenceSchema>;

export const securityLotSizeRequestSchema = z.strictObject({
  contractVersion: z.literal(3), consumer: z.literal('thesis-ledger'),
  requestId: z.string().trim().min(1), symbol: securityLotSymbolSchema,
});
export const securityLotSizeResponseSchema = securityLotReferenceSchema.extend({
  contractVersion: z.literal(3), consumer: z.literal('thesis-ledger'),
  requestId: z.string().trim().min(1), fetchedAt: z.iso.datetime({ offset: true }),
  policyRevision: z.number().int().positive(),
  routeTarget: z.strictObject({
    providerId: z.enum(['futu', 'longbridge']), upstreamSource: z.enum(['futu', 'longbridge']),
    routeIndex: z.number().int().min(0).max(1),
  }),
}).superRefine((value, context) => {
  if (value.source.symbol && value.source.symbol !== value.symbol)
    context.addIssue({ code: 'custom', path: ['source', 'symbol'], message: '每手股数参考标的不一致' });
  if (value.source.provider !== value.routeTarget.providerId || value.routeTarget.upstreamSource !== value.routeTarget.providerId)
    context.addIssue({ code: 'custom', path: ['routeTarget'], message: '每手股数实际来源不一致' });
  if (Date.parse(value.source.observedAt) > Date.parse(value.fetchedAt))
    context.addIssue({ code: 'custom', path: ['source', 'observedAt'], message: '来源观察不能晚于本次返回' });
});
export type SecurityLotSizeResponse = z.infer<typeof securityLotSizeResponseSchema>;
