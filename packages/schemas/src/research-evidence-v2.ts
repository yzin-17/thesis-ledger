import { z } from 'zod';
import { canonicalNewsUrlV3 } from './market-news-v3.js';
import { currencySchema } from './market.js';

export const researchFingerprintV2Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const RESEARCH_MAX_NUMERIC_FIELDS_V2 = 1000;
const text = (max: number) => z.string().min(1).max(max);
const time = z.iso.datetime({ offset: true }).nullable();
export const researchNumericFieldV2Schema = z.strictObject({
  fieldPath: z
    .string()
    .max(512)
    .regex(/^(?:\/(?:[^~]|~[01])*)+$/u)
    .refine(
      (value) =>
        !value
          .split('/')
          .some((part) =>
            ['__proto__', 'prototype', 'constructor'].includes(
              part.replaceAll('~1', '/').replaceAll('~0', '~'),
            ),
          ),
      '数值引用不能访问原型路径',
    ),
  unit: z.string().trim().min(1).max(64),
  currency: currencySchema.nullable(),
});
const sourceUrl = text(4096).refine((value) => {
  try {
    canonicalNewsUrlV3(value);
    return true;
  } catch {
    return false;
  }
}, '研究引用必须是无凭据的 HTTP(S) URL');

/** 服务端绑定的证据审计；模型只持有 evidenceId/fieldPath。 */
export const researchEvidenceAuditV2Schema = z.strictObject({
  evidenceId: z.uuid(),
  fingerprint: researchFingerprintV2Schema,
  kind: z.enum(['quote', 'news', 'reference', 'portfolio', 'risk', 'strategy', 'journal']),
  providerId: text(128).nullable(),
  upstreamSource: text(128).nullable(),
  contractVersion: text(128).nullable(),
  policyRevision: text(200).nullable(),
  routeRevision: text(200).nullable(),
  credentialRevision: text(200).nullable(),
  sourceIds: z.array(text(256)).max(1000),
  sourceUrls: z.array(sourceUrl).max(1000),
  publishedAt: time,
  availableAt: time,
  fetchedAt: time,
});
export const researchFrozenEvidenceV2Schema = z
  .strictObject({
    audit: researchEvidenceAuditV2Schema,
    required: z.boolean(),
    usable: z.boolean(),
    status: z.enum(['available', 'partial', 'unavailable']),
    data: z.json(),
    numericFields: z
      .array(researchNumericFieldV2Schema)
      .max(RESEARCH_MAX_NUMERIC_FIELDS_V2)
      .default([])
      .refine(
        (fields) => new Set(fields.map((field) => field.fieldPath)).size === fields.length,
        '数值字段路径不能重复',
      ),
    reasons: z.array(text(512)).max(100),
  })
  .superRefine((value, context) => {
    if (
      value.usable &&
      (value.status === 'unavailable' ||
        value.data === null ||
        value.audit.fetchedAt === null ||
        value.audit.providerId === null ||
        value.audit.contractVersion === null ||
        value.audit.sourceIds.length === 0)
    )
      context.addIssue({ code: 'custom', message: '不可用、缺数据或未知抓取的证据不能用于引用' });
    if (value.status === 'unavailable' && (value.data !== null || !value.reasons.length))
      context.addIssue({ code: 'custom', message: '不可用证据必须保留原因并且无可用数据' });
    if (value.status === 'partial' && !value.reasons.length)
      context.addIssue({ code: 'custom', message: '部分证据必须说明缺失原因' });
    if (!value.usable && !value.reasons.length)
      context.addIssue({ code: 'custom', message: '不可引用证据必须保留原因' });
  });
export const researchQualityV2Schema = z
  .strictObject({
    status: z.enum(['complete', 'partial']),
    reasons: z.array(text(512)).max(100),
  })
  .refine(
    (value) => (value.status === 'complete') === (value.reasons.length === 0),
    '资料质量与缺失原因不一致',
  );
export const researchEvidenceBindingV2Schema = z
  .strictObject({
    audit: researchEvidenceAuditV2Schema,
    toolCallId: z.uuid(),
  })
  .refine(
    (value) =>
      value.audit.providerId !== null &&
      value.audit.contractVersion !== null &&
      value.audit.fetchedAt !== null &&
      value.audit.sourceIds.length > 0,
    '成功引用必须具有实际来源与抓取事实',
  );
export type ResearchFrozenEvidenceV2 = z.infer<typeof researchFrozenEvidenceV2Schema>;
