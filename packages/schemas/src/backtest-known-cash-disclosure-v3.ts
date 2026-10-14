import { z } from 'zod';
import { backtestKnownCashResearchInputV3Schema } from './backtest-known-cash-research-v3.js';
import {
  marketKnownCashRecordV3Schema,
  marketKnownCashControlIdentityV3Schema,
  marketKnownCashQueryIdentityV3Schema,
  validateMarketKnownCashRecordsV3,
} from './market-known-cash-record-v3.js';
import { nonNegativeDecimalStringSchema } from './monetary-values.js';
import { compareMarketPitEvidenceInstantStringsV1 } from './market-pit-evidence-instant-v1.js';

function cashAmountMatches(quantity: string, unitAmount: string, grossAmount: string): boolean {
  const decimal = (value: string) => {
    const [integer, fraction = ''] = value.split('.');
    return { number: BigInt(integer! + fraction), scale: fraction.length };
  };
  try {
    const q = decimal(quantity);
    const unit = decimal(unitAmount);
    const gross = decimal(grossAmount);
    return (
      q.number * unit.number * 10n ** BigInt(gross.scale) ===
      gross.number * 10n ** BigInt(q.scale + unit.scale)
    );
  } catch {
    return false;
  }
}

export const backtestKnownCashDisclosureV3Schema = z
  .strictObject({
    version: z.literal('known-cash-dividend-disclosure-v1'),
    preparationHash: z.string().regex(/^[a-f0-9]{64}$/),
    policy: backtestKnownCashResearchInputV3Schema.shape.policy,
    scope: backtestKnownCashResearchInputV3Schema.shape.scope,
    source: backtestKnownCashResearchInputV3Schema.shape.source.extend({
      queryIdentity: marketKnownCashQueryIdentityV3Schema,
      controlIdentity: marketKnownCashControlIdentityV3Schema,
    }),
    coverage: backtestKnownCashResearchInputV3Schema.shape.coverage,
    revisions: backtestKnownCashResearchInputV3Schema.shape.revisions,
    ignoredEmptyRows: z.number().int().nonnegative(),
    assessment: backtestKnownCashResearchInputV3Schema.shape.assessment,
    records: z
      .array(
        marketKnownCashRecordV3Schema.safeExtend({
          eligibleQuantity: nonNegativeDecimalStringSchema.nullable(),
          grossCashAmount: nonNegativeDecimalStringSchema.nullable(),
          status: z.enum(['simulated-paid', 'receivable', 'unavailable', 'not-adopted']),
          reason: z.string().min(1).optional(),
        }),
      )
      .superRefine((records, ctx) => {
        const seen = new Set<string>();
        records.forEach((record, index) => {
          const key = `${record.symbol}:${record.effectiveDate}`;
          if (seen.has(key))
            ctx.addIssue({ code: 'custom', path: [index], message: '现金结果重复' });
          seen.add(key);
          if (record.status === 'unavailable' || record.status === 'not-adopted') {
            if (
              record.eligibleQuantity !== null ||
              record.grossCashAmount !== null ||
              !record.reason
            )
              ctx.addIssue({ code: 'custom', path: [index], message: '未入账事件不得补造金额' });
          } else if (record.eligibleQuantity === null || record.grossCashAmount === null) {
            ctx.addIssue({ code: 'custom', path: [index], message: '已入账事件缺登记资格或金额' });
          } else if (
            !cashAmountMatches(
              record.eligibleQuantity,
              record.amountPerFundUnit,
              record.grossCashAmount,
            )
          ) {
            ctx.addIssue({
              code: 'custom',
              path: [index, 'grossCashAmount'],
              message: '税前现金与登记资格及每份金额不一致',
            });
          }
        });
      }),
  })
  .superRefine((value, ctx) => {
    validateMarketKnownCashRecordsV3(value.records, value.scope, value.source.observedAt, ctx);
    const order = compareMarketPitEvidenceInstantStringsV1(
      value.source.observedAt,
      value.scope.dataAsOf,
    );
    if (
      order === undefined ||
      order > 0 ||
      value.source.queryIdentity.requestedSymbol !== value.scope.symbol
    )
      ctx.addIssue({
        code: 'custom',
        path: ['source'],
        message: '现金结果来源时钟或请求身份与冻结范围不一致',
      });
  });
export type BacktestKnownCashDisclosureV3 = z.infer<typeof backtestKnownCashDisclosureV3Schema>;
