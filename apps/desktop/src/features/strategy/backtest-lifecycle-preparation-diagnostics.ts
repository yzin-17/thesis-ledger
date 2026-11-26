import { runConfigSchemaV3, type BacktestLifecycleEvidence } from '@thesis-ledger/schemas';

export function lifecycleEvidenceSources(response: BacktestLifecycleEvidence) {
  if ('composition' in response) {
    return response.composition.entries.flatMap((entry) => {
      if (entry.status !== 'included') return [];
      return [{
        capability: entry.result.routeKey.capability,
        providerId: entry.result.routeTarget.providerId,
        upstreamSource: entry.result.routeTarget.upstreamSource,
      }];
    });
  }
  return [{
    capability: response.routeKey.capability,
    providerId: response.provenance.providerId,
    upstreamSource: response.provenance.upstreamSource,
  }];
}

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
    ...('composition' in life.response
      ? {
          lifecycleRange: life.response.range,
          lifecycleSources: life.response.composition.entries.flatMap((entry) => {
            if (entry.status !== 'included') return [];
            const { result } = entry;
            return [{
              capability: result.routeKey.capability,
              providerId: sanitize(result.routeTarget.providerId),
              upstreamSource: sanitize(result.routeTarget.upstreamSource),
              observedAt: result.clock.observedAt,
              records: result.evidence.map(({ sha256, hashScope, observedAt }) => ({
                sha256,
                hashScope,
                observedAt,
              })),
            }];
          }),
        }
      : {
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
        }),
  };
}
