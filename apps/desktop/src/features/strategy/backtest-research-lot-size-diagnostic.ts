import { backtestExecutionModelSchemaV3 } from '@thesis-ledger/schemas';

export function researchLotSizeDiagnostic(model: unknown, sanitize: (value: string) => string | null = value => value) {
  const parsed = backtestExecutionModelSchemaV3.safeParse(model);
  const preset = parsed.success ? parsed.data.researchLotSize : undefined;
  if (!preset) return undefined;
  return { sharesPerLot: preset.sharesPerLot, defaultSharesPerLot: preset.defaultSharesPerLot,
    origin: preset.origin, historicalChanges: preset.historicalChanges,
    source: { ...(preset.source.symbol ? { symbol: preset.source.symbol } : {}),
      provider: sanitize(preset.source.provider), sourceUrl: sanitize(preset.source.sourceUrl),
      sha256: preset.source.sha256, observedAt: preset.source.observedAt } };
}
