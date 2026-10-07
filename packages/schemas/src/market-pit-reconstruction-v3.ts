import { z } from 'zod';
import { compareMarketPitEvidenceInstantStringsV1 as compareInstant } from './market-pit-evidence-instant-v1.js';
import {
  marketPitHistoricalDecisionWindowV3Schema,
  boundMarketPitEvidenceStructureV3,
} from './market-pit-historical-evidence-v1.js';
import {
  marketDataBarRouteKeyV3Schema,
  marketDataRouteTargetPinV3Schema,
  type MarketDataBarSeriesRequestV3,
  type MarketDataBarSeriesResponseV3,
} from './market-data-wire-v3.js';
import { sourcePriceBasisSchema } from './market-price-protocol.js';
import {
  reconstructionScopeMatches,
  reconstructionArchivesMatch,
  reconstructionFactsWithinCutoff,
} from './market-pit-reconstruction-manifest-validation-v3.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime({ offset: true });
const text = z.string().trim().min(1).max(256);

const proofFields = z.strictObject({
  contractVersion: z.literal(1),
  kind: z.literal('market-pit-reconstruction'),
  symbol: text,
  routeKey: marketDataBarRouteKeyV3Schema.refine(
    (value) => value.capability === 'DAILY_BAR' && value.timeframe === '1d',
    '首批历史重建证据仅支持日线',
  ),
  target: marketDataRouteTargetPinV3Schema,
  window: z.strictObject({ start: z.iso.date(), end: z.iso.date() }),
  seriesVersion: z.string().regex(/^market-series-v1:identified:[a-f0-9]{64}$/),
  inputFingerprint: text,
  sourcePriceBasis: sourcePriceBasisSchema,
  dataAsOf: timestamp,
  barArchives: z
    .array(
      z.strictObject({
        timestamp,
        windowIdentityFingerprint: digest,
        completeResponseHash: digest,
      }),
    )
    .min(1)
    .max(100_000),
});
const validateProof = (
  value: z.infer<typeof proofFields>,
  context: z.RefinementCtx,
  exact = false,
) => {
  const revision = value.sourcePriceBasis.revision;
  if (revision.origin !== 'provider' || /(^|[:/_-])unknown($|[:/_-])/i.test(revision.id)) {
    context.addIssue({
      code: 'custom',
      path: ['sourcePriceBasis', 'revision'],
      message: '严格历史重建清单需要已知供应商修订',
    });
  }
  if (value.window.start > value.window.end) {
    context.addIssue({
      code: 'custom',
      path: ['window', 'end'],
      message: '重建窗口结束日期不得早于起点',
    });
  }
  const hashes = new Map<string, string>();
  for (const [index, item] of value.barArchives.entries()) {
    if (
      index > 0 &&
      (exact
        ? (compareInstant(item.timestamp, value.barArchives[index - 1]!.timestamp) ?? 0) <= 0
        : Date.parse(item.timestamp) <= Date.parse(value.barArchives[index - 1]!.timestamp))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['barArchives', index, 'timestamp'],
        message: '归档 Bar 时间须严格递增且不重复',
      });
    }
    const known = hashes.get(item.windowIdentityFingerprint);
    if (known && known !== item.completeResponseHash) {
      context.addIssue({
        code: 'custom',
        path: ['barArchives', index, 'completeResponseHash'],
        message: '同一不可变窗口不能引用冲突的响应摘要',
      });
    }
    hashes.set(item.windowIdentityFingerprint, item.completeResponseHash);
  }
};
export const marketPitReconstructionProofV3Schema = proofFields.superRefine((value, context) =>
  validateProof(value, context),
);
export type MarketPitReconstructionProofV3 = z.infer<typeof marketPitReconstructionProofV3Schema>;

const proofV2 = proofFields
  .extend({
    contractVersion: z.literal(2),
    historicalDecisionWindow: marketPitHistoricalDecisionWindowV3Schema,
  })
  .superRefine((proof, context) => {
    validateProof({ ...proof, contractVersion: 1 }, context, true);
    const fail = (message: string) => context.addIssue({ code: 'custom', message });
    const evidence = proof.historicalDecisionWindow;
    if (evidence.barDecisionBindings.length !== proof.barArchives.length)
      fail('历史窗口绑定须覆盖全部原始 Bar');
    for (const [index, binding] of evidence.barDecisionBindings.entries()) {
      const archive = proof.barArchives[index];
      if (
        !archive ||
        archive.timestamp !== binding.timestamp ||
        archive.windowIdentityFingerprint !== binding.windowIdentityFingerprint ||
        archive.completeResponseHash !== binding.completeResponseHash
      )
        fail('历史窗口须按原始清单同序绑定 Bar 时间与归档引用');
    }
    const archives = new Map(
      proof.barArchives.map((item) => [item.windowIdentityFingerprint, item.completeResponseHash]),
    );
    if (
      evidence.sourceWitnesses.some(
        (item) => archives.get(item.windowIdentityFingerprint) !== item.completeResponseHash,
      )
    )
      fail('来源见证须引用原始清单内归档');
    for (const calendar of evidence.calendars) {
      if (
        calendar.market !== proof.routeKey.market ||
        !calendar.symbolScope.includes(proof.symbol) ||
        calendar.historicalRange.start > proof.window.start ||
        calendar.historicalRange.end < proof.window.end
      )
        fail('日历市场、标的或覆盖范围与清单不一致');
    }
    const facts = [
      proof.sourcePriceBasis.observedAt,
      ...proof.barArchives.map((v) => v.timestamp),
      ...evidence.originalEvidence.map((v) => v.acquiredAt),
      ...evidence.calendars.map((v) => v.acquiredAt),
      ...evidence.sourceWitnesses.map((v) => v.revisionKnownAvailableAt),
      ...evidence.barDecisionBindings.map((v) => v.decisionAt),
    ];
    if (facts.some((fact) => (compareInstant(fact, proof.dataAsOf) ?? 1) > 0))
      fail('已发生历史证据不得晚于冻结截点');
  });
export const marketPitReconstructionProofV2Schema = z.preprocess(
  boundMarketPitEvidenceStructureV3,
  proofV2,
);
export type MarketPitReconstructionProofV2 = z.infer<typeof marketPitReconstructionProofV2Schema>;
export const marketPitReconstructionManifestV3Schema = z.preprocess(
  boundMarketPitEvidenceStructureV3,
  z.union([marketPitReconstructionProofV3Schema, marketPitReconstructionProofV2Schema]),
);
export type MarketPitReconstructionManifestV3 = z.infer<
  typeof marketPitReconstructionManifestV3Schema
>;

export type MarketPitReconstructionBindingV3 =
  | { status: 'bound'; proof: MarketPitReconstructionProofV3 }
  | {
      status: 'unavailable';
      reason:
        | 'invalid-proof'
        | 'scope-mismatch'
        | 'price-basis-mismatch'
        | 'bar-archive-mismatch'
        | 'future-fact';
    };

/** 仅绑定清单与输入；不证明引用存在、原文摘要有效或历史时点已核验。 */
export const bindMarketPitReconstructionProofV3 = (input: {
  proof: unknown;
  request: MarketDataBarSeriesRequestV3;
  response: MarketDataBarSeriesResponseV3;
  seriesVersion: string;
  dataAsOf: string;
}): MarketPitReconstructionBindingV3 => {
  const parsed = marketPitReconstructionProofV3Schema.safeParse(input.proof);
  if (!parsed.success) return { status: 'unavailable', reason: 'invalid-proof' };
  return bindParsedProof(input, parsed.data);
};
const bindParsedProof = (
  input: Parameters<typeof bindMarketPitReconstructionProofV3>[0],
  proof: MarketPitReconstructionProofV3,
): MarketPitReconstructionBindingV3 => {
  const { response } = input;
  if (!reconstructionScopeMatches(input, proof))
    return { status: 'unavailable', reason: 'scope-mismatch' };
  const basis = sourcePriceBasisSchema.safeParse(response.sourcePriceBasis);
  if (!basis.success || JSON.stringify(proof.sourcePriceBasis) !== JSON.stringify(basis.data)) {
    return { status: 'unavailable', reason: 'price-basis-mismatch' };
  }
  if (!reconstructionArchivesMatch(proof, response))
    return { status: 'unavailable', reason: 'bar-archive-mismatch' };
  if (!reconstructionFactsWithinCutoff(input, basis.data))
    return { status: 'unavailable', reason: 'future-fact' };
  return { status: 'bound', proof };
};

export type MarketPitReconstructionManifestBindingV3 =
  | { status: 'bound'; proof: MarketPitReconstructionManifestV3 }
  | Extract<MarketPitReconstructionBindingV3, { status: 'unavailable' }>;

/** 联合清单仍只绑定必要条件；v2 结构通过不代表历史资格。 */
export const bindMarketPitReconstructionManifestV3 = (
  input: Parameters<typeof bindMarketPitReconstructionProofV3>[0],
): MarketPitReconstructionManifestBindingV3 => {
  const parsed = marketPitReconstructionManifestV3Schema.safeParse(input.proof);
  if (!parsed.success) return { status: 'unavailable', reason: 'invalid-proof' };
  const proof = parsed.data;
  let legacy: MarketPitReconstructionProofV3;
  if (proof.contractVersion === 2) {
    const { historicalDecisionWindow, ...fields } = proof;
    legacy = { ...fields, contractVersion: 1 };
    if (
      historicalDecisionWindow.barDecisionBindings.some(
        (binding, index) =>
          compareInstant(binding.decisionAt, input.response.bars[index]?.availableAt ?? '') !== 0 ||
          compareInstant(binding.timestamp, input.response.bars[index]?.timestamp ?? '') !== 0,
      )
    ) {
      return { status: 'unavailable', reason: 'bar-archive-mismatch' };
    }
  } else legacy = proof;
  const binding = bindParsedProof(input, legacy);
  if (binding.status === 'unavailable') return binding;
  return { status: 'bound', proof };
};
