import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { MarketEventResponseV3 } from '@thesis-ledger/schemas';

const mappingSchema = z.strictObject({
  contractVersion: z.literal(1),
  kind: z.literal('split-date-mapping'),
  mappings: z
    .array(
      z.strictObject({
        symbol: z.string().regex(/^[0-9]{6}\.(SH|SZ)$/),
        sourceConversionDate: z.iso.date(),
        sourceRatioPerUnit: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/),
        effectiveDate: z.iso.date(),
        recordDate: z.iso.date().nullable(),
        announcementDate: z.iso.date(),
        documentUrl: z.url({ protocol: /^https$/ }),
        documentSha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(1)
    .max(1000),
});

const decimal = (value: string) =>
  value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;

/** 在线选择与离线冻结均验证原文摘要及逐事件映射；不授予覆盖。 */
export function verifySplitMappingV3(response: MarketEventResponseV3): void {
  const evidence = response.dateMappingEvidence;
  if (!evidence) return;
  if (
    Buffer.byteLength(evidence.content, 'utf8') > 1024 * 1024 ||
    createHash('sha256').update(evidence.content, 'utf8').digest('hex') !== evidence.sha256
  ) {
    throw new Error('拆分日期映射原文摘要无效');
  }
  const bundle = mappingSchema.parse(JSON.parse(evidence.content));
  const admission = response.admission;
  if (!admission) throw new Error('拆分日期映射缺少准入');
  const identities = new Set<string>();
  for (const mapping of bundle.mappings) {
    const identity = `${mapping.symbol}:${mapping.sourceConversionDate}:${decimal(mapping.sourceRatioPerUnit)}`;
    if (
      identities.has(identity) ||
      decimal(mapping.sourceRatioPerUnit) === '0' ||
      mapping.sourceConversionDate > mapping.effectiveDate ||
      mapping.announcementDate > mapping.effectiveDate ||
      (mapping.recordDate !== null && mapping.recordDate > mapping.effectiveDate) ||
      !admission.scopeSymbols.includes(mapping.symbol) ||
      mapping.effectiveDate < admission.scopeDateFrom ||
      mapping.effectiveDate > admission.scopeDateTo
    ) {
      throw new Error('拆分日期映射重复或超出准入范围');
    }
    identities.add(identity);
  }
  for (const fact of response.facts) {
    const matches = bundle.mappings.filter(
      (mapping) =>
        mapping.symbol === fact.symbol &&
        mapping.effectiveDate === fact.effectiveDate &&
        (mapping.recordDate ?? undefined) === fact.recordDate &&
        decimal(mapping.sourceRatioPerUnit) === decimal(fact.ratio ?? ''),
    );
    if (fact.type !== 'SPLIT' || matches.length !== 1) throw new Error('拆分事实与日期映射不匹配');
  }
}
