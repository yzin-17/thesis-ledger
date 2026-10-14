import {
  DecimalValue,
  type BacktestCorporateActionFact,
  type TradingCalendar,
} from '@thesis-ledger/domain';
import {
  backtestKnownCashResearchInputV3Schema,
  type BacktestKnownCashResearchInputV3,
} from '@thesis-ledger/schemas';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import { prepareEventAccountingV3 } from './backtest-event-accounting-v3.js';
import { knownCashRecordAdoptedV3 } from './backtest-known-cash-selection-v3.js';

type InputBody = Omit<BacktestKnownCashResearchInputV3, 'recordsHash' | 'contentHash'>;

function assertOriginalAmounts(input: BacktestKnownCashResearchInputV3): void {
  for (const record of input.records) {
    let original = DecimalValue.from(record.amountPerFundUnit);
    if (record.sourceAmount.unit === 'per-ten-fund-units') original = original.times('10');
    if (original.compareTo(record.sourceAmount.value) !== 0)
      throw new Error('已知方案原金额与每份金额不一致');
  }
}

/** 只冻结通用方案；供应商字段解释由适配层完成。 */
export function freezeKnownCashResearchInputV3(input: InputBody): BacktestKnownCashResearchInputV3 {
  const parsed = backtestKnownCashResearchInputV3Schema.parse({
    ...input,
    records: [...input.records].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)),
    recordsHash: '0'.repeat(64),
    contentHash: '0'.repeat(64),
  });
  assertOriginalAmounts(parsed);
  parsed.recordsHash = hashCanonicalManifest({ records: parsed.records });
  parsed.contentHash = hashCanonicalManifest(parsed);
  return parsed;
}

/** 自校验不够：必须同时匹配准备阶段已绑定的摘要。 */
export function verifyKnownCashResearchInputV3(
  frozen: unknown,
  expectedContentHash: string,
): BacktestKnownCashResearchInputV3 {
  const input = backtestKnownCashResearchInputV3Schema.parse(frozen);
  assertOriginalAmounts(input);
  if (
    input.recordsHash !== hashCanonicalManifest({ records: input.records }) ||
    input.contentHash !== hashCanonicalManifest(input) ||
    input.contentHash !== expectedContentHash
  )
    throw new Error('已知方案冻结输入或准备摘要不一致，需重新准备');
  return input;
}

/** 返回研究记账投影，不声明实际支付或完整事件覆盖，不提供策略信号。 */
export function projectKnownCashResearchAccountingV3(
  frozen: unknown,
  expectedContentHash: string,
  marketInputs: {
    calendar: TradingCalendar;
    bars: readonly { openedAt: string }[];
  },
): { input: BacktestKnownCashResearchInputV3; actions: BacktestCorporateActionFact[] } {
  const input = verifyKnownCashResearchInputV3(frozen, expectedContentHash);
  const { scope, source } = input;
  const actions: BacktestCorporateActionFact[] = input.records
    .filter((record) => knownCashRecordAdoptedV3(input.policy, record))
    .map((record) => ({
      symbol: record.symbol,
      market: scope.market,
      instrumentType: scope.instrumentType,
      type: 'CASH_DIVIDEND',
      cashAmount: record.amountPerFundUnit,
      currency: record.currency,
      recordDate: record.recordDate,
      effectiveDate: record.effectiveDate,
      paymentDate: record.paymentDate,
      occurredAt: `${record.effectiveDate}T00:00:00+08:00`,
      availableAt: source.observedAt,
      provider: source.target.providerId,
      providerRevision: source.providerRevision,
    }));
  return {
    input,
    actions: prepareEventAccountingV3(actions, {
      ...marketInputs,
      ...scope,
      cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1',
    }),
  };
}
