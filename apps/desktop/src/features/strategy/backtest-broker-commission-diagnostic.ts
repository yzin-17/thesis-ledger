import { backtestExecutionModelSchemaV3 } from '@thesis-ledger/schemas';

export function brokerCommissionDiagnostic(model: unknown) {
  const parsed = backtestExecutionModelSchemaV3.safeParse(model);
  if (!parsed.success) return [];
  return parsed.data.segments.flatMap((segment) => {
    const profile = segment.fees?.brokerCommission;
    return profile ? [{ segmentId: segment.id, range: segment.range, currency: segment.fees!.currency,
      configuration: profile }] : [];
  });
}
