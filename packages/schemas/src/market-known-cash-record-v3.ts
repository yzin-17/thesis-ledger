import { z } from 'zod';
import { positiveDecimalStringSchema } from './monetary-values.js';
import { compareMarketPitEvidenceInstantStringsV1 } from './market-pit-evidence-instant-v1.js';

const text = z.string().trim().min(1);
const opaqueStatus = z.string().refine((value) => value.trim().length > 0);
export const marketKnownCashControlIdentityV3Schema = z.strictObject({
  providerConfigVersion: z.number().int().nonnegative(),
  credentialRevision: z.string().regex(/^(hmac-sha256-v1:[a-f0-9]{64}|not-required)$/),
});
export const marketKnownCashQueryIdentityV3Schema = z.strictObject({
  kind: z.literal('request-bound-query-v1'),
  requestedSymbol: text,
  queryIdentifier: text,
  currencyBasis: z.literal('explicit-research-scope'),
  historicalIdentity: z.literal('notVerified'),
});

/** 通用方案观察；原始进度字段为不透明来源元数据。金额为税前现金。 */
export const marketKnownCashRecordV3Schema = z
  .strictObject({
    symbol: text,
    announcementDate: z.iso.date().nullable(),
    recordDate: z.iso.date(),
    effectiveDate: z.iso.date(),
    paymentDate: z.iso.date(),
    amountPerFundUnit: positiveDecimalStringSchema,
    currency: z.literal('CNY'),
    planStatus: z.enum(['implementation-plan-announced', 'unknown']),
    statusBasis: z.enum([
      'research-assumption',
      'source-defined',
      'unverified',
      'event-reconciled',
    ]),
    sourceStatus: opaqueStatus.nullable().optional(),
    normalizedStatus: z.enum(['unknown', 'implemented']).optional(),
    issues: z.array(text).optional(),
    reconciliationReference: z.url().optional(),
    sourcePlanStatus: opaqueStatus.nullable(),
    sourceSemanticsRevision: text,
    sourceAmount: z.strictObject({
      value: positiveDecimalStringSchema,
      unit: z.enum(['per-ten-fund-units', 'per-fund-unit']),
    }),
  })
  .superRefine((record, ctx) => {
    if (
      (record.planStatus === 'unknown' ||
        record.statusBasis === 'unverified' ||
        record.statusBasis === 'event-reconciled') &&
      record.sourceStatus === undefined
    )
      ctx.addIssue({ code: 'custom', message: '新标准记录缺少原状态及标准状态' });
    if (record.sourceStatus !== undefined) {
      if (
        record.sourceStatus !== record.sourcePlanStatus ||
        record.normalizedStatus === undefined ||
        record.issues === undefined ||
        record.statusBasis === 'research-assumption' ||
        (record.sourceStatus === null &&
          (record.normalizedStatus !== 'unknown' ||
            !record.issues?.includes('MISSING_DIVIDEND_STATUS'))) ||
        (record.statusBasis === 'event-reconciled' && !record.reconciliationReference) ||
        (record.normalizedStatus === 'unknown' && record.planStatus !== 'unknown') ||
        (record.statusBasis === 'source-defined' && record.normalizedStatus !== 'implemented')
      )
        ctx.addIssue({ code: 'custom', message: '标准分红状态或事件核对依据不一致' });
    }
    if (
      (record.announcementDate !== null && record.announcementDate > record.recordDate) ||
      record.recordDate >= record.effectiveDate ||
      record.paymentDate < record.effectiveDate
    )
      ctx.addIssue({ code: 'custom', message: '方案公告/登记/除息/发放日冲突' });
    // 在公共合同边界核对十进制单位，不将精确金额转成浮点数。
    try {
      const [integer, fraction = ''] = record.amountPerFundUnit.split('.');
      const [sourceInteger, sourceFraction = ''] = record.sourceAmount.value.split('.');
      const width = Math.max(fraction.length, sourceFraction.length);
      let amount = BigInt(integer! + fraction.padEnd(width, '0'));
      if (record.sourceAmount.unit === 'per-ten-fund-units') amount *= 10n;
      const sourceAmount = BigInt(sourceInteger! + sourceFraction.padEnd(width, '0'));
      if (amount !== sourceAmount) throw new Error('amount-mismatch');
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceAmount'],
        message: '方案原金额与每份金额不一致或无效',
      });
    }
  });
export type MarketKnownCashRecordV3 = z.infer<typeof marketKnownCashRecordV3Schema>;

/** 请求范围与源时钟约束同时用于交换及冻结输入，保持同一语义。 */
export function validateMarketKnownCashRecordsV3(
  records: readonly MarketKnownCashRecordV3[],
  scope: { symbol: string; startDate: string; endDate: string },
  observedAt: string,
  ctx: z.RefinementCtx,
): void {
  const keys = new Set<string>();
  records.forEach((record, index) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: 'custom', path: ['records', index], message });
    if (record.symbol !== scope.symbol) issue('方案证券不匹配');
    if (record.effectiveDate < scope.startDate || record.effectiveDate > scope.endDate)
      issue('方案除息日不在请求区间');
    if (record.announcementDate !== null) {
      const order = compareMarketPitEvidenceInstantStringsV1(
        `${record.announcementDate}T00:00:00+08:00`,
        observedAt,
      );
      if (order === undefined || order > 0) issue('方案公告晚于来源观察');
    } else if (!record.issues?.includes('MISSING_ANNOUNCEMENT_DATE')) {
      issue('缺公告日须保留明确问题');
    }
    const key = `${record.symbol}:${record.effectiveDate}`;
    if (keys.has(key)) issue('同证券除息日方案重复');
    keys.add(key);
    if (index > 0 && records[index - 1]!.effectiveDate > record.effectiveDate)
      issue('方案须按除息日排序');
  });
}
