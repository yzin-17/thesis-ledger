import { createHash } from 'node:crypto';
import { z } from 'zod';
import { barPointSchema } from '@thesis-ledger/schemas';
import { freezeMarketDerivedSeriesV3 } from './market-derived-series-snapshot-v3.js';
import { deriveMarketSeriesV3 } from './market-derived-series-v3.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const EVENT_FREE_EVIDENCE_REVISION = 'market-event-free-economic-evidence-v1';
export const eventFreeEvidenceSchema = z.strictObject({
  format: z.literal('event-free-economic-price-v1'),
  symbol: z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/),
  market: z.literal('CN'),
  assetType: z.literal('STOCK'),
  currency: z.literal('CNY'),
  start: z.iso.date(),
  end: z.iso.date(),
  anchorDate: z.iso.date(),
  source: z.strictObject({ providerId: z.string().min(1), upstreamSource: z.string().min(1) }),
  qualifiedAt: z.iso.datetime({ offset: true }),
  bars: z.array(barPointSchema).min(2).max(32),
  independentReturn: z.string().min(1),
  qualification: z.strictObject({
    kind: z.literal('verified-event-free-window'),
    eventDates: z.array(z.iso.date()).min(1).max(10_000),
    fullEventCount: z.number().int().positive(),
    windowEventCount: z.literal(0),
    documentationSha256: hash,
    corporateActionContentHash: hash,
    rawPriceContentHash: hash,
    captureSha256: hash,
  }),
});
export type EventFreeEvidence = z.infer<typeof eventFreeEvidenceSchema>;
export const economicEvidenceHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** 资格由已审核源材料及完整事件流提供；这里再次执行领域不变量，不接收Provider DTO。 */
export function prepareEventFreeEvidence(raw: unknown) {
  const bundle = eventFreeEvidenceSchema.parse(raw);
  const q = bundle.qualification;
  if (
    bundle.start >= bundle.end ||
    bundle.anchorDate !== bundle.end ||
    q.fullEventCount !== q.eventDates.length ||
    new Set(q.eventDates).size !== q.eventDates.length ||
    q.eventDates.some(
      (d, i) => (d >= bundle.start && d <= bundle.end) || (i > 0 && d >= q.eventDates[i - 1]!),
    )
  )
    throw new Error('无事件价格证据的范围、锚点或完整性无效');
  const dates = bundle.bars.map((bar) => bar.timestamp.slice(0, 10));
  if (
    dates[0] !== bundle.start ||
    dates.at(-1) !== bundle.end ||
    dates.some((d, i) => i > 0 && d <= dates[i - 1]!) ||
    bundle.bars.some(
      (b) =>
        b.completionStatus !== 'complete' ||
        b.volume === null ||
        b.volume <= 0 ||
        b.amount === null ||
        b.amount <= 0 ||
        b.availableAt !== bundle.qualifiedAt ||
        new Date(b.timestamp).getTime() !==
          Date.parse(`${b.timestamp.slice(0, 10)}T00:00:00+08:00`),
    )
  )
    throw new Error('无事件价格证据必须是原窗口完整已交易日线');
  const fingerprint = economicEvidenceHash(bundle);
  const input = {
    identity: {
      symbol: bundle.symbol,
      assetType: 'STOCK' as const,
      timeframe: '1d' as const,
      adjustment: 'none' as const,
    },
    rawEvidenceRef: `captured-raw:${fingerprint}`,
    dataAsOf: bundle.qualifiedAt,
    bars: bundle.bars,
    conversion: {
      kind: 'multiplicative-price-factor' as const,
      adjustment: 'qfq' as const,
      evidenceRef: `event-free:${economicEvidenceHash(q)}`,
      sourceRevision: EVENT_FREE_EVIDENCE_REVISION,
      basisRef: `fixed-end:${bundle.anchorDate}:${fingerprint}`,
      anchorFactor: 1,
      anchorAvailableAt: bundle.qualifiedAt,
      volumeSemantics: 'unadjusted' as const,
      amountSemantics: 'unadjusted' as const,
      factors: bundle.bars.map((b) => ({
        timestamp: b.timestamp,
        value: 1,
        availableAt: bundle.qualifiedAt,
      })),
    },
  };
  const derived = deriveMarketSeriesV3(input);
  const independent = Number(bundle.independentReturn);
  if (
    !Number.isFinite(independent) ||
    Math.abs(derived.bars.at(-1)!.close / derived.bars[0]!.close - 1 - independent) > 1e-12
  )
    throw new Error('经济回报与独立计算不一致');
  const derivedSnapshot = freezeMarketDerivedSeriesV3(input);
  const certificate = {
    format: EVENT_FREE_EVIDENCE_REVISION,
    bundle,
    derivedFingerprint: derivedSnapshot.inputFingerprint,
  };
  return {
    bundle,
    dates,
    derived,
    derivedSnapshot,
    certificate,
    certificateFingerprint: economicEvidenceHash(certificate),
  };
}
