import { backtestKnownCashDisclosureV3Schema } from '@thesis-ledger/schemas';

/** 只输出经过合同校验的结果白名单，保留未知覆盖和模拟发放依据。 */
export function knownCashDiagnosticExport(
  value: unknown,
  sanitize: (value: unknown) => string | null,
) {
  const parsed = backtestKnownCashDisclosureV3Schema.safeParse(value);
  if (!parsed.success) return undefined;
  const disclosure = parsed.data;
  return {
    ...disclosure,
    coverage: { complete: false as const, reason: sanitize(disclosure.coverage.reason) },
    source: {
      ...disclosure.source,
      target: {
        ...disclosure.source.target,
        providerId: sanitize(disclosure.source.target.providerId),
        upstreamSource: sanitize(disclosure.source.target.upstreamSource),
      },
      providerRevision: sanitize(disclosure.source.providerRevision),
      adapterRevision: sanitize(disclosure.source.adapterRevision),
      normalizationRevision: sanitize(disclosure.source.normalizationRevision),
      queryIdentity: {
        ...disclosure.source.queryIdentity,
        queryIdentifier: sanitize(disclosure.source.queryIdentity.queryIdentifier),
      },
    },
    records: disclosure.records.map((record) => ({
      ...record,
      sourcePlanStatus: sanitize(record.sourcePlanStatus),
      sourceSemanticsRevision: sanitize(record.sourceSemanticsRevision),
      ...(record.reason ? { reason: sanitize(record.reason) } : {}),
    })),
  };
}
