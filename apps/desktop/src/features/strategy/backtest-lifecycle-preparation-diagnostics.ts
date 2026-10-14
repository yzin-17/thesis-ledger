import { runConfigSchemaV3 } from '@thesis-ledger/schemas';

export function lifecyclePreparationDiagnosticExport(
  value: unknown,
  sanitize: (text: unknown) => string | null,
) {
  const config = runConfigSchemaV3.safeParse(value);
  if (!config.success || !config.data.lifecyclePreparation) return undefined;
  const life = config.data.lifecyclePreparation;
  return {
    version: life.version,
    requestedRange: { start: config.data.startDate, end: config.data.endDate },
    signalStartDate: life.signalStartDate,
    requiredWarmupBars: life.requiredWarmupBars,
    inputHash: life.inputHash,
    priceResponseHash: life.priceResponseHash,
    basicLifecycle: life.response.basicLifecycle
      ? {
          ...life.response.basicLifecycle,
          sourceRecordId: sanitize(life.response.basicLifecycle.sourceRecordId),
          reason: sanitize(life.response.basicLifecycle.reason),
        }
      : undefined,
    lifecycleSource: {
      providerId: sanitize(life.response.provenance.providerId),
      upstreamSource: sanitize(life.response.provenance.upstreamSource),
      range: life.response.range,
      records: life.response.sourceRecords?.map((record) => ({
        responseSha256: record.responseSha256,
        observedAt: record.observedAt,
        queryMethod: sanitize(record.queryMethod),
      })),
    },
  };
}
