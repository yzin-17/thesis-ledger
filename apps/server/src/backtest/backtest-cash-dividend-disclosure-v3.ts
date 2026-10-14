import { DecimalValue } from '@thesis-ledger/domain';
import {
  backtestCashDividendDisclosureV3Schema,
  marketEventExchangeV3Schema,
  parseMarketNoticeDividendPackV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import type { ExchangeVerticalResult } from './backtest-v2-execution-shared.js';

/** 来源从已重验的冻结 exchange 读取，资格和金额从真实 Ledger 结果读取。 */
export function cashDividendDisclosureV3(
  config: RunConfigV3,
  evidence: readonly ArtifactRow[],
  events: ExchangeVerticalResult['cashEvents'],
) {
  const model = config.executionPriceProtocol.cashEventResearch;
  if (!model) return undefined;
  if (!events) throw new Error('现金研究缺领域入账结果');
  const records = evidence
    .filter((row) => row.purpose === 'corporateActions')
    .flatMap((row) => {
      if (typeof row.response !== 'string') throw new Error('现金研究缺冻结原文');
      const bundle = JSON.parse(row.response) as { exchanges: unknown[] };
      return bundle.exchanges.flatMap((value) => {
        const response = marketEventExchangeV3Schema.parse(value).response;
        if (!response.noticeDividendEvidence) throw new Error('当前现金披露只支持公告来源');
        const pack = parseMarketNoticeDividendPackV3(response.noticeDividendEvidence.content);
        return response.facts.map((fact) => {
          if (!fact.recordDate || !fact.paymentDate || !fact.effectiveDate || !fact.cashAmount)
            throw new Error('现金事实日期或金额缺失');
          const applied = events.actions.find(
            (action) =>
              action.applied &&
              action.mutation.fact.symbol === fact.symbol &&
              action.mutation.fact.effectiveDate === fact.effectiveDate,
          );
          let quantity: string | null = null;
          let amount: string | null = null;
          let status: 'paid' | 'receivable' | 'unavailable' = 'unavailable';
          if (applied?.applied) {
            quantity = applied.ledger.state.position.settledQuantity;
            amount = DecimalValue.from(quantity).times(fact.cashAmount).toString();
            status = events.ledger.some(
              (mutation) => mutation.applied && mutation.eventId === `${applied.eventId}:payment`,
            )
              ? 'paid'
              : 'receivable';
          }
          return {
            symbol: fact.symbol,
            effectiveDate: fact.effectiveDate,
            recordDate: fact.recordDate,
            paymentDate: fact.paymentDate,
            amountPerFundUnit: fact.cashAmount,
            currency: fact.currency,
            eligibleQuantity: quantity,
            grossCashAmount: amount,
            status,
            ...(status === 'unavailable' ? { reason: '现金事件未成功入账，请查看任务诊断' } : {}),
            provider: fact.provider,
            providerRevision: fact.providerRevision,
            observedAt: fact.availableAt,
            sourceDocuments: pack.sourceDocuments.map(
              ({ id, title, url, sha256, publishedDate, observedAt }) => ({
                id,
                title,
                url,
                sha256,
                publishedDate,
                observedAt,
              }),
            ),
          };
        });
      });
    });
  return backtestCashDividendDisclosureV3Schema.parse({
    model,
    splitEvents: 'not-modelled',
    historicalAvailability: 'notVerified',
    records,
  });
}
