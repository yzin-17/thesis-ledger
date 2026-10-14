import { backtestCashDividendDisclosureV3Schema } from '@thesis-ledger/schemas';

/** 格式2诊断只输出已校验白名单；不输出事件准入或完整原包。 */
export function cashDividendDiagnosticExport(
  value: unknown,
  sanitize: (text: unknown) => string | null,
) {
  const parsed = backtestCashDividendDisclosureV3Schema.safeParse(value);
  if (!parsed.success) return undefined;
  const disclosure = parsed.data;
  return {
    model: disclosure.model,
    splitEvents: disclosure.splitEvents,
    historicalAvailability: disclosure.historicalAvailability,
    records: disclosure.records.map((record) => ({
      symbol: sanitize(record.symbol),
      effectiveDate: record.effectiveDate,
      recordDate: record.recordDate,
      paymentDate: record.paymentDate,
      amountPerFundUnit: record.amountPerFundUnit,
      currency: record.currency,
      eligibleQuantity: record.eligibleQuantity,
      grossCashAmount: record.grossCashAmount,
      status: record.status,
      reason: sanitize(record.reason),
      provider: sanitize(record.provider),
      providerRevision: sanitize(record.providerRevision),
      observedAt: record.observedAt,
      sourceDocuments: record.sourceDocuments.map((document) => ({
        id: sanitize(document.id),
        title: sanitize(document.title),
        url: sanitize(document.url),
        sha256: document.sha256,
        publishedDate: document.publishedDate,
        observedAt: document.observedAt,
      })),
    })),
  };
}
