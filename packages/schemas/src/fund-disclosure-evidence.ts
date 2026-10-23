import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const clock = z.iso.datetime({ offset: true, precision: 3 });
const identity = {
  fundSymbol: z.string().regex(/^\d{6}\.OF$/),
  reportPeriod: z.string().regex(/^[2-9]\d{3}-Q[1-4]$/),
  referenceVersion: digest,
};

const matched = z
  .strictObject({
    status: z.literal('matched'),
    ...identity,
    issuer: z.string().min(1),
    precision: z.literal('DATE_ONLY'),
    publishedOn: z.iso.date(),
    timezone: z.literal('Asia/Shanghai'),
    referenceObservedAt: clock,
    availableAt: clock,
    holdingsDigest: digest,
    matchedCount: z.number().int().min(1),
    referenceCount: z.number().int().min(1),
    algorithm: z.literal('exact_symbol_weight_v1'),
    sources: z
      .array(
        z.strictObject({
          role: z.enum(['report', 'publication_notice']),
          url: z
            .string()
            .min(9)
            .regex(/^https:\/\/\S+$/),
          sha256: digest,
        }),
      )
      .min(2),
  })
  .superRefine((value, context) => {
    const observed = Date.parse(value.referenceObservedAt);
    const publication = Date.parse(`${value.publishedOn}T00:00:00+08:00`);
    if (
      !/^[2-9]\d{3}-Q[1-4]$/.test(value.reportPeriod) ||
      !Number.isFinite(observed) ||
      !Number.isFinite(publication)
    )
      return;
    const year = Number(value.reportPeriod.slice(0, 4));
    const month = Number(value.reportPeriod.at(-1)) * 3;
    const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const observedDay = new Date(observed + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const endOfPublicationDay = publication + 86400000;
    if (value.publishedOn < periodEnd || value.publishedOn > observedDay)
      context.addIssue({
        code: 'custom',
        path: ['publishedOn'],
        message: '披露日与报告期或参考核对日矛盾',
      });
    if (Date.parse(value.availableAt) !== Math.max(observed, endOfPublicationDay))
      context.addIssue({
        code: 'custom',
        path: ['availableAt'],
        message: '披露保守可用边界不匹配',
      });
    if (value.matchedCount > value.referenceCount)
      context.addIssue({ code: 'custom', path: ['matchedCount'], message: '匹配项数超过参考项数' });
    if (new Set(value.sources.map((source) => source.role)).size !== 2)
      context.addIssue({ code: 'custom', path: ['sources'], message: '缺少报告或实际披露公告' });
    const seen = new Map<string, string>();
    for (const source of value.sources) {
      if (seen.has(source.url) && seen.get(source.url) !== source.sha256)
        context.addIssue({ code: 'custom', path: ['sources'], message: '同一披露来源内容冲突' });
      seen.set(source.url, source.sha256);
    }
  });

export const fundDisclosureEvidenceSchema = z.discriminatedUnion('status', [
  matched,
  z.strictObject({
    status: z.literal('unavailable'),
    reasonCode: z.literal('holdings_mismatch'),
    ...identity,
  }),
]);
export type FundDisclosureEvidence = z.infer<typeof fundDisclosureEvidenceSchema>;
