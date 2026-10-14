import { DecimalValue } from '@thesis-ledger/domain';
import { backtestKnownCashDisclosureV3Schema, type RunConfigV3 } from '@thesis-ledger/schemas';
import type { ExchangeVerticalResult } from './backtest-v2-execution-shared.js';
import { knownCashRecordAdoptedV3 } from './backtest-known-cash-selection-v3.js';

/** 来源/研究边界来自冻结原包，资格与模拟到账来自领域Ledger，不冒充实际支付。 */
export function knownCashDisclosureV3(
  config: RunConfigV3,
  events: ExchangeVerticalResult['cashEvents'],
) {
  const prepared = config.knownCashPreparation;
  if (!prepared) return undefined;
  if (!events) throw new Error('已知现金研究缺少领域结果');
  const records = prepared.input.records.map((record) => {
    if (!knownCashRecordAdoptedV3(prepared.input.policy, record))
      return {
        ...record,
        eligibleQuantity: null,
        grossCashAmount: null,
        status: 'not-adopted' as const,
        reason: '未知状态且未经具体事件核对；本次未选择假设采用',
      };
    const action = events.actions.find(
      (x) =>
        x.applied &&
        x.mutation.fact.symbol === record.symbol &&
        x.mutation.fact.effectiveDate === record.effectiveDate,
    );
    if (!action?.applied || action.mutation.ledgerEvent.type !== 'cashDividend')
      return {
        ...record,
        eligibleQuantity: null,
        grossCashAmount: null,
        status: 'unavailable' as const,
        reason: '已知现金方案未成功入账，请查看诊断',
      };
    const quantity = action.mutation.ledgerEvent.payload.eligibleQuantity;
    if (quantity === undefined) throw new Error('已知现金结果缺少明确登记资格');
    const paid = events.ledger.some((x) => x.applied && x.eventId === `${action.eventId}:payment`);
    return {
      ...record,
      eligibleQuantity: quantity,
      grossCashAmount: DecimalValue.from(quantity).times(record.amountPerFundUnit).toString(),
      status: paid ? ('simulated-paid' as const) : ('receivable' as const),
    };
  });
  return backtestKnownCashDisclosureV3Schema.parse({
    version: 'known-cash-dividend-disclosure-v1',
    preparationHash: prepared.contentHash,
    policy: prepared.input.policy,
    scope: prepared.input.scope,
    source: prepared.input.source,
    coverage: prepared.input.coverage,
    ignoredEmptyRows: prepared.input.ignoredEmptyRows,
    ...(prepared.input.assessment ? { assessment: prepared.input.assessment } : {}),
    records,
    revisions: prepared.input.revisions,
  });
}
