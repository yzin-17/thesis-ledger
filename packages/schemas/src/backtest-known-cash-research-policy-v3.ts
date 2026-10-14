import { z } from 'zod';

/** 选择全部假设后，才允许将覆盖未知的已公布方案用于现金研究。 */
export const backtestKnownCashResearchPolicyV3Schema = z.strictObject({
  version: z.literal('known-announced-cash-events-v1'),
  entitlement: z.enum(['settled-record-date-holdings', 'cn-etf-record-close-holdings-v2']),
  receivable: z.literal('ex-date'),
  settlement: z.literal('assume-scheduled-payment-date'),
  missingEvents: z.literal('excluded-with-unknown-coverage'),
  usage: z.literal('accounting-only'),
  splitEvents: z.literal('not-modelled'),
  historicalAvailability: z.literal('notVerified'),
  // 缺省只用于旧冻结输入；新准备必须显式传入研究选择。
  uncertainRecords: z.enum(['exclude', 'assume-scheduled']).optional(),
});
export type BacktestKnownCashResearchPolicyV3 = z.infer<
  typeof backtestKnownCashResearchPolicyV3Schema
>;
