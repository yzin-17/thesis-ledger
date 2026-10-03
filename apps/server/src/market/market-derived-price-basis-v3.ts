import { sourcePriceBasisSchema } from '@thesis-ledger/schemas';
import { z } from 'zod';
import { latestDerivedInstantV3 } from './market-derived-instant-v3.js';
import { readMarketDerivedSeriesV3 } from './market-derived-series-snapshot-v3.js';

const semanticsSchema = z.strictObject({
  basisScope: z.enum(['global', 'request-window', 'provider-defined']),
  dividendMeaning: z.enum(['embedded-verified', 'provider-defined']),
  dividendEvidenceRef: z.string().trim().min(1).nullable(),
});
export type DerivedPriceSemanticsV3 = z.infer<typeof semanticsSchema>;

/** 量额语义由计算合同固定，基准范围与分红语义必须由调用方独立核验。 */
export function resolveDerivedPriceBasisV3(
  snapshot: unknown,
  expectedFingerprint: string,
  semantics: DerivedPriceSemanticsV3,
) {
  const declared = semanticsSchema.parse(semantics);
  const result = readMarketDerivedSeriesV3(snapshot, expectedFingerprint);
  const observedAt = latestDerivedInstantV3(result.bars.map((bar) => bar.availableAt));
  return sourcePriceBasisSchema.parse({
    adjustment: result.identity.adjustment,
    method: 'local-derived',
    methodVersion: result.derivation.algorithmRevision,
    basisScope: declared.basisScope,
    anchor: result.derivation.basisRef,
    revision: { origin: 'local-observation', contentHash: result.derivation.inputFingerprint },
    observedAt,
    volumeBasis: 'original',
    dividendMeaning: declared.dividendMeaning,
    dividendEvidenceRef: declared.dividendEvidenceRef,
    conversionAvailable: true,
    conversionEvidenceRef: result.derivation.factorEvidenceRef,
    derivation: {
      inputFingerprint: result.derivation.inputFingerprint,
      factorOrEventFingerprint: result.derivation.factorOrEventFingerprint,
      algorithmVersion: result.derivation.algorithmRevision,
    },
  });
}
