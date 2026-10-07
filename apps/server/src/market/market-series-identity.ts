import { createHash } from 'node:crypto';
import {
  canonicalBarSeriesEncoding,
  sourcePriceBasisSchema,
  type BarPoint,
  type BarSeriesIdentity,
  type SourcePriceBasisFact,
} from '@thesis-ledger/schemas';

export const LEGACY_MARKET_SERIES_VERSION = 'legacy';

export type MarketSeriesIdentityStatus = 'identified' | 'unknown';

export type MarketSeriesBasisWindow = {
  start: string;
  end: string;
};

type MarketSeriesSource = {
  providerId: string;
  upstreamSource: string;
};

type MarketSeriesIdentityInput = MarketSeriesSource & {
  identity: BarSeriesIdentity;
  priceBasis?: SourcePriceBasisFact | null;
  basisWindow?: MarketSeriesBasisWindow;
};

export type MarketSeriesIdentity = {
  seriesVersion: string;
  identityStatus: MarketSeriesIdentityStatus;
};

const normalizeBasisWindow = (window?: MarketSeriesBasisWindow) => {
  if (!window) return null;
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end)
    throw new Error('复权 request-window 必须有有效且有序的基准窗口');
  return [new Date(start).toISOString(), new Date(end).toISOString()] as const;
};

const priceBasisDescriptor = (
  identity: BarSeriesIdentity,
  priceBasis: SourcePriceBasisFact | null | undefined,
  basisWindow?: MarketSeriesBasisWindow,
) => {
  if (!priceBasis) return null;
  const basis = sourcePriceBasisSchema.parse(priceBasis);
  if (basis.adjustment !== identity.adjustment)
    throw new Error('价格口径与行情序列 identity 不一致');
  const normalizedWindow = normalizeBasisWindow(basisWindow);
  return {
    adjustment: basis.adjustment,
    method: basis.method,
    methodVersion: basis.methodVersion,
    basisScope: basis.basisScope,
    anchor: basis.anchor,
    basisWindow: basis.basisScope === 'request-window' ? normalizedWindow : null,
    revision:
      basis.revision.origin === 'provider'
        ? ['provider', basis.revision.id]
        : ['local-observation', basis.revision.contentHash],
    volumeBasis: basis.volumeBasis,
    ...(basis.fieldUnits ? { fieldUnits: basis.fieldUnits } : {}),
    dividendMeaning: basis.dividendMeaning,
    dividendEvidenceRef: basis.dividendEvidenceRef,
    conversionAvailable: basis.conversionAvailable,
    conversionEvidenceRef: basis.conversionEvidenceRef,
    derivation: basis.derivation
      ? [
          basis.derivation.inputFingerprint,
          basis.derivation.factorOrEventFingerprint,
          basis.derivation.algorithmVersion,
        ]
      : null,
  };
};

const hasIdentifiedPriceBasis = (
  identity: BarSeriesIdentity,
  priceBasis: SourcePriceBasisFact | null | undefined,
  basisWindow?: MarketSeriesBasisWindow,
) => {
  if (!priceBasis) return false;
  const basis = sourcePriceBasisSchema.parse(priceBasis);
  if (basis.adjustment !== identity.adjustment) return false;
  const revisionIsKnown =
    basis.revision.origin === 'local-observation' ||
    (basis.revision.origin === 'provider' && basis.revision.id.toLowerCase() !== 'unknown');
  if (!revisionIsKnown) return false;
  if (identity.adjustment !== 'none' && basis.anchor === null) return false;
  if (basis.basisScope === 'request-window' && !normalizeBasisWindow(basisWindow)) return false;
  return true;
};

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * A stable price identity for persistence. When upstream basis facts are absent,
 * the version is explicitly marked unknown and scoped to the observed content.
 * Observation/fetch timestamps and caller limits are not inputs to this helper.
 */
export const createMarketSeriesIdentity = (
  input: MarketSeriesIdentityInput & { points: readonly BarPoint[] },
): MarketSeriesIdentity => {
  const basis = priceBasisDescriptor(input.identity, input.priceBasis, input.basisWindow);
  const identityStatus = hasIdentifiedPriceBasis(
    input.identity,
    input.priceBasis,
    input.basisWindow,
  )
    ? 'identified'
    : 'unknown';
  const observedContentHash =
    identityStatus === 'unknown'
      ? hash(canonicalBarSeriesEncoding(input.identity, input.points))
      : null;
  const versionHash = hash(
    JSON.stringify([
      'market-bar-series-identity-v1',
      input.identity.symbol,
      input.identity.assetType,
      input.identity.timeframe,
      input.identity.adjustment,
      input.providerId,
      input.upstreamSource,
      basis,
      observedContentHash,
    ]),
  );
  return {
    seriesVersion: `market-series-v1:${identityStatus}:${versionHash}`,
    identityStatus,
  };
};

/** Returns a selectable version only when the request carries a complete basis identity. */
export const resolveMarketSeriesIdentity = (
  input: MarketSeriesIdentityInput,
): MarketSeriesIdentity | null => {
  if (
    !hasIdentifiedPriceBasis(input.identity, input.priceBasis, input.basisWindow) ||
    !input.priceBasis
  )
    return null;
  return createMarketSeriesIdentity({ ...input, points: [] });
};

/** View caches also separate explicit bases while ignoring their observation time. */
export const marketSeriesBasisCacheKey = (
  identity: BarSeriesIdentity,
  priceBasis?: SourcePriceBasisFact | null,
  basisWindow?: MarketSeriesBasisWindow,
) => hash(JSON.stringify(priceBasisDescriptor(identity, priceBasis, basisWindow)));

export const marketSeriesIdentityStatus = (seriesVersion: string): MarketSeriesIdentityStatus =>
  seriesVersion.startsWith('market-series-v1:identified:') ? 'identified' : 'unknown';
