import { z } from 'zod';

const text = z.string().trim().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);

/** 规则原文单独冻结；documentHash 指向披露文件，contentHash 指向规则记录。 */
export const backtestNavResearchRuleV3Schema = z
  .strictObject({
    id: text,
    version: text,
    symbol: z.string().regex(/^\d{6}\.OF$/),
    fundType: z.enum(['domestic', 'qdii']),
    applicableRange: z.strictObject({ startDate: z.iso.date(), endDate: z.iso.date() }),
    delayWorkdays: z.number().int().positive(),
    basis: z.enum(['domestic-default', 'verified-fund-rule']),
    evidenceRef: text,
    documentHash: hash,
    contentHash: hash,
    configuredAt: z.iso.datetime({ offset: true }),
  })
  .superRefine((rule, context) => {
    if (
      rule.applicableRange.startDate > rule.applicableRange.endDate ||
      (rule.fundType === 'qdii' && rule.basis !== 'verified-fund-rule') ||
      (rule.basis === 'domestic-default' && rule.delayWorkdays !== 1)
    ) {
      context.addIssue({
        code: 'custom',
        message: '净值规则区间或工作日延迟无效；QDII 必须核查具体规则',
      });
    }
  });

export const backtestNavVisibilityV3Schema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('strict-publication') }),
  z.strictObject({
    mode: z.literal('research-assumption'),
    boundary: z.literal('after-disclosure-day-end'),
    timezone: z.literal('Asia/Shanghai'),
    rule: backtestNavResearchRuleV3Schema,
    disclosureCalendarHash: hash,
  }),
]);
export type BacktestNavVisibilityV3 = z.infer<typeof backtestNavVisibilityV3Schema>;

export const backtestNavPublicationEvidenceV3Schema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('source-publication-record'),
    sourceRecordId: text,
    sourcePublishedAt: z.iso.datetime({ offset: true }),
    rawRecordHash: hash,
    evidenceRef: text,
  }),
  z.strictObject({
    kind: z.literal('research-assumption'),
    sourceRecordId: text,
    rawRecordHash: hash,
    evidenceRef: text,
    ruleHash: hash,
    disclosureCalendarHash: hash,
    disclosureDate: z.iso.date(),
    assumedAvailableAt: z.iso.datetime({ offset: true }),
  }),
]);
