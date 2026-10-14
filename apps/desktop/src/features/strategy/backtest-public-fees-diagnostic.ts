import { backtestPublicFeesDisclosureV3Schema } from '@thesis-ledger/schemas';

export function publicFeesDiagnosticExport(
  value: unknown,
  sanitize: (value: unknown) => string | null,
) {
  const parsed = backtestPublicFeesDisclosureV3Schema.safeParse(value);
  if (!parsed.success) return undefined;
  const disclosure = parsed.data;
  if (disclosure.status === 'executionModel')
    return { status: disclosure.status, reason: sanitize(disclosure.reason) };
  const { response } = disclosure;
  return {
    status: disclosure.status,
    symbol: sanitize(response.symbol),
    range: { ...response.range },
    fallbackReason: sanitize(disclosure.fallbackReason),
    segments: response.segments.map((segment) => ({
      range: { ...segment.range },
      charges: segment.charges.map((charge) => ({
        ...charge,
        sourceDocumentIds: charge.sourceDocumentIds.map(sanitize),
      })),
    })),
    sourceDocuments: response.sourceDocuments.map((doc) => ({
      ...doc,
      id: sanitize(doc.id),
      title: sanitize(doc.title),
      url: sanitize(doc.url),
    })),
    provenance: {
      ...response.provenance,
      coverageDescription: sanitize(response.provenance.coverageDescription),
    },
  };
}
