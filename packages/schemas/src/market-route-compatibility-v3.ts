import { z } from 'zod';
import { marketDataBarRouteKeyV3Schema } from './market-data-wire-v3.js';
import { sourcePriceBasisSchema } from './market-price-protocol.js';
import { marketRouteKeyIdV3 } from './market-route-v3.js';
import { marketRouteTargetSchema } from './market-route-target.js';

const text = z.string().trim().min(1);
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);

const dateRangeSchema = z
  .strictObject({ start: isoDate, end: isoDate })
  .superRefine((range, context) => {
    if (range.start > range.end) {
      context.addIssue({ code: 'custom', path: ['end'], message: '固定基准范围结束日早于开始日' });
    }
  });

const amountSemanticsSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('unknown') }),
  z.strictObject({
    status: z.literal('verified'),
    currency: z.string().regex(/^[A-Z]{3}$/),
    unitMultiplier: z.number().finite().positive(),
    definition: z.enum(['reported-turnover', 'price-times-volume']),
    evidenceRef: text,
  }),
]);
export type MarketRouteAmountSemanticsV3 = z.infer<typeof amountSemanticsSchema>;

/**
 * The observed facts required to assess a route proof. DSA's V3 response currently
 * lacks amount semantics and fixed basis ranges; producers must supply audited values.
 */
export const marketRoutePriceFactsV3Schema = z.strictObject({
  seriesFingerprint: fingerprint,
  priceBasis: sourcePriceBasisSchema,
  fixedBasisRange: dateRangeSchema,
  amountSemantics: amountSemanticsSchema,
});
export type MarketRoutePriceFactsV3 = z.infer<typeof marketRoutePriceFactsV3Schema>;

const routeTargetsSchema = z
  .strictObject({
    primary: marketRouteTargetSchema.strict(),
    backup: marketRouteTargetSchema.strict(),
  })
  .superRefine((targets, context) => {
    if (
      targets.primary.providerId === targets.backup.providerId &&
      targets.primary.upstreamSource === targets.backup.upstreamSource
    ) {
      context.addIssue({ code: 'custom', path: ['backup'], message: '主备 RouteTarget 必须不同' });
    }
  });

const auditEvidenceSchema = z.strictObject({
  reference: text,
  revision: text,
  fingerprint,
});

const sourceFactsPairSchema = z.strictObject({
  primary: marketRoutePriceFactsV3Schema,
  backup: marketRoutePriceFactsV3Schema,
});

const verificationSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('verified-equivalence'),
    evidence: z.array(auditEvidenceSchema).min(1),
  }),
  z
    .strictObject({
      kind: z.literal('verified-conversion'),
      algorithmId: text,
      algorithmVersion: text,
      dimensions: z.array(z.enum(['price', 'volume', 'amount', 'dividend'])).min(1),
      inputFingerprint: fingerprint,
      outputFingerprint: fingerprint,
      evidence: z.array(auditEvidenceSchema).min(1),
    })
    .superRefine((conversion, context) => {
      const seen = new Set<string>();
      conversion.dimensions.forEach((dimension, index) => {
        if (seen.has(dimension)) {
          context.addIssue({
            code: 'custom',
            path: ['dimensions', index],
            message: '转换维度不得重复',
          });
        }
        seen.add(dimension);
      });
    }),
]);

/** A proof is pinned to one exact route pair and one exact complete data window. */
export const marketRouteCompatibilityProofV3Schema = z
  .strictObject({
    contractVersion: z.literal(3),
    proofId: text,
    proofRevision: text,
    routeKey: marketDataBarRouteKeyV3Schema,
    targets: routeTargetsSchema,
    symbol: text,
    window: dateRangeSchema,
    sourceFacts: sourceFactsPairSchema,
    verification: verificationSchema,
    issuedAt: isoDateTime,
    validFrom: isoDateTime,
    validUntil: isoDateTime,
  })
  .superRefine((proof, context) => {
    if (proof.window.start > proof.window.end) {
      context.addIssue({
        code: 'custom',
        path: ['window', 'end'],
        message: '证明适用窗口结束日早于开始日',
      });
    }
    if (Date.parse(proof.issuedAt) > Date.parse(proof.validFrom)) {
      context.addIssue({
        code: 'custom',
        path: ['validFrom'],
        message: '证明生效时间不得早于签发时间',
      });
    }
    if (Date.parse(proof.validFrom) >= Date.parse(proof.validUntil)) {
      context.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message: '证明失效时间必须晚于生效时间',
      });
    }
    for (const [side, facts] of Object.entries(proof.sourceFacts)) {
      const base = facts.priceBasis;
      if (base.adjustment !== proof.routeKey.adjustment) {
        context.addIssue({
          code: 'custom',
          path: ['sourceFacts', side, 'priceBasis', 'adjustment'],
          message: '来源口径必须与精确 RouteKey 一致',
        });
      }
      if (
        base.basisScope === 'request-window' &&
        (facts.fixedBasisRange.start !== proof.window.start ||
          facts.fixedBasisRange.end !== proof.window.end)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['sourceFacts', side, 'fixedBasisRange'],
          message: 'request-window 基准范围必须与证明窗口一致',
        });
      }
      if (
        base.basisScope === 'global' &&
        (facts.fixedBasisRange.start > proof.window.start ||
          facts.fixedBasisRange.end < proof.window.end)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['sourceFacts', side, 'fixedBasisRange'],
          message: 'global 固定基准范围必须覆盖证明窗口',
        });
      }
    }
    if (proof.verification.kind === 'verified-conversion') {
      if (proof.verification.inputFingerprint !== proof.sourceFacts.backup.seriesFingerprint) {
        context.addIssue({
          code: 'custom',
          path: ['verification', 'inputFingerprint'],
          message: '转换输入指纹必须绑定备用来源事实',
        });
      }
      if (proof.verification.outputFingerprint !== proof.sourceFacts.primary.seriesFingerprint) {
        context.addIssue({
          code: 'custom',
          path: ['verification', 'outputFingerprint'],
          message: '转换输出指纹必须绑定主来源基准事实',
        });
      }
    }
  });
export type MarketRouteCompatibilityProofV3 = z.infer<typeof marketRouteCompatibilityProofV3Schema>;

export const marketRouteCompatibilityObservationV3Schema = z.strictObject({
  routeKey: marketDataBarRouteKeyV3Schema,
  targets: routeTargetsSchema,
  symbol: text,
  window: dateRangeSchema,
  sourceFacts: sourceFactsPairSchema,
});
export type MarketRouteCompatibilityObservationV3 = z.infer<
  typeof marketRouteCompatibilityObservationV3Schema
>;

export const marketRouteCompatibilityAssessmentReasonV3 = [
  'compatible',
  'invalid_proof',
  'invalid_observation',
  'expired',
  'identity_mismatch',
  'window_mismatch',
  'source_facts_mismatch',
  'basis_unverified',
  'semantics_mismatch',
  'conversion_mismatch',
] as const;
export type MarketRouteCompatibilityAssessmentReasonV3 =
  (typeof marketRouteCompatibilityAssessmentReasonV3)[number];

export type MarketRouteCompatibilityAssessmentV3 = {
  eligible: boolean;
  reason: MarketRouteCompatibilityAssessmentReasonV3;
};

const blocked = (reason: Exclude<MarketRouteCompatibilityAssessmentReasonV3, 'compatible'>) =>
  ({
    eligible: false,
    reason,
  }) satisfies MarketRouteCompatibilityAssessmentV3;

const targetId = (target: z.infer<typeof marketRouteTargetSchema>) =>
  JSON.stringify([target.providerId, target.upstreamSource]);

const factsEncoding = (facts: MarketRoutePriceFactsV3) =>
  JSON.stringify([
    facts.seriesFingerprint,
    facts.priceBasis.adjustment,
    facts.priceBasis.method,
    facts.priceBasis.methodVersion,
    facts.priceBasis.basisScope,
    facts.priceBasis.anchor,
    facts.priceBasis.revision.origin,
    facts.priceBasis.revision.origin === 'provider'
      ? facts.priceBasis.revision.id
      : facts.priceBasis.revision.contentHash,
    facts.priceBasis.observedAt,
    facts.priceBasis.volumeBasis,
    facts.priceBasis.dividendMeaning,
    facts.priceBasis.dividendEvidenceRef,
    facts.priceBasis.conversionAvailable,
    facts.priceBasis.conversionEvidenceRef,
    facts.priceBasis.derivation === null
      ? null
      : [
          facts.priceBasis.derivation.inputFingerprint,
          facts.priceBasis.derivation.factorOrEventFingerprint,
          facts.priceBasis.derivation.algorithmVersion,
        ],
    [facts.fixedBasisRange.start, facts.fixedBasisRange.end],
    facts.amountSemantics.status === 'unknown'
      ? ['unknown']
      : [
          'verified',
          facts.amountSemantics.currency,
          facts.amountSemantics.unitMultiplier,
          facts.amountSemantics.definition,
          facts.amountSemantics.evidenceRef,
        ],
  ]);

const unresolvedFactsReason = (
  facts: MarketRoutePriceFactsV3,
  window: z.infer<typeof dateRangeSchema>,
) => {
  const basis = facts.priceBasis;
  if (
    basis.basisScope === 'provider-defined' ||
    basis.anchor === null ||
    basis.volumeBasis === 'unknown' ||
    basis.dividendMeaning === 'provider-defined' ||
    facts.amountSemantics.status === 'unknown'
  )
    return true;
  if (basis.dividendMeaning === 'explicit-cash' && basis.dividendEvidenceRef === null) return true;
  if (
    basis.basisScope === 'request-window' &&
    (facts.fixedBasisRange.start !== window.start || facts.fixedBasisRange.end !== window.end)
  )
    return true;
  return facts.fixedBasisRange.start > window.start || facts.fixedBasisRange.end < window.end;
};

const differingDimensions = (primary: MarketRoutePriceFactsV3, backup: MarketRoutePriceFactsV3) => {
  const dimensions: Array<'price' | 'volume' | 'amount' | 'dividend'> = [];
  const priceEncoding = (facts: MarketRoutePriceFactsV3) =>
    JSON.stringify([
      facts.priceBasis.adjustment,
      facts.priceBasis.method,
      facts.priceBasis.methodVersion,
      facts.priceBasis.basisScope,
      facts.priceBasis.anchor,
      facts.fixedBasisRange.start,
      facts.fixedBasisRange.end,
    ]);
  if (priceEncoding(primary) !== priceEncoding(backup)) dimensions.push('price');
  if (primary.priceBasis.volumeBasis !== backup.priceBasis.volumeBasis) dimensions.push('volume');
  const amountEncoding = (facts: MarketRoutePriceFactsV3) =>
    facts.amountSemantics.status === 'unknown'
      ? JSON.stringify(['unknown'])
      : JSON.stringify([
          facts.amountSemantics.currency,
          facts.amountSemantics.unitMultiplier,
          facts.amountSemantics.definition,
        ]);
  if (amountEncoding(primary) !== amountEncoding(backup)) dimensions.push('amount');
  if (primary.priceBasis.dividendMeaning !== backup.priceBasis.dividendMeaning)
    dimensions.push('dividend');
  return dimensions;
};

/** Pure fail-closed decision; proof creation and evidence authentication belong to producers. */
export const assessMarketRouteCompatibilityV3 = (input: {
  proof: unknown;
  observation: unknown;
  now: string;
}): MarketRouteCompatibilityAssessmentV3 => {
  const proofResult = marketRouteCompatibilityProofV3Schema.safeParse(input.proof);
  if (!proofResult.success) return blocked('invalid_proof');
  const observationResult = marketRouteCompatibilityObservationV3Schema.safeParse(
    input.observation,
  );
  if (!observationResult.success || !isoDateTime.safeParse(input.now).success) {
    return blocked('invalid_observation');
  }
  const proof = proofResult.data;
  const observation = observationResult.data;
  const now = Date.parse(input.now);
  if (now < Date.parse(proof.validFrom) || now >= Date.parse(proof.validUntil))
    return blocked('expired');

  if (
    marketRouteKeyIdV3(proof.routeKey) !== marketRouteKeyIdV3(observation.routeKey) ||
    targetId(proof.targets.primary) !== targetId(observation.targets.primary) ||
    targetId(proof.targets.backup) !== targetId(observation.targets.backup) ||
    proof.symbol !== observation.symbol
  )
    return blocked('identity_mismatch');

  if (
    proof.window.start !== observation.window.start ||
    proof.window.end !== observation.window.end
  ) {
    return blocked('window_mismatch');
  }
  if (
    factsEncoding(proof.sourceFacts.primary) !== factsEncoding(observation.sourceFacts.primary) ||
    factsEncoding(proof.sourceFacts.backup) !== factsEncoding(observation.sourceFacts.backup)
  )
    return blocked('source_facts_mismatch');

  if (
    unresolvedFactsReason(observation.sourceFacts.primary, observation.window) ||
    unresolvedFactsReason(observation.sourceFacts.backup, observation.window)
  )
    return blocked('basis_unverified');

  const differences = differingDimensions(
    observation.sourceFacts.primary,
    observation.sourceFacts.backup,
  );
  if (proof.verification.kind === 'verified-equivalence') {
    if (differences.some((dimension) => dimension !== 'price')) {
      return blocked('semantics_mismatch');
    }
  } else {
    const actualDimensions = [...differences].sort();
    const declaredDimensions = [...proof.verification.dimensions].sort();
    if (
      proof.verification.inputFingerprint !== observation.sourceFacts.backup.seriesFingerprint ||
      proof.verification.outputFingerprint !== observation.sourceFacts.primary.seriesFingerprint ||
      JSON.stringify(actualDimensions) !== JSON.stringify(declaredDimensions)
    )
      return blocked('conversion_mismatch');
  }

  return { eligible: true, reason: 'compatible' };
};
