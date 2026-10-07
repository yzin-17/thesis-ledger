import { createHash } from 'node:crypto';
import { barPointSchema, barSeriesIdentitySchema } from '@thesis-ledger/schemas';
import { z } from 'zod';
import { compareDerivedInstantV3, latestDerivedInstantV3 } from './market-derived-instant-v3.js';

const text = z.string().trim().min(1);
const instant = z.iso.datetime({ offset: true });
const positive = z.number().finite().positive();
export const marketDerivedSeriesInputV3Schema = z.strictObject({
  identity: barSeriesIdentitySchema.extend({ adjustment: z.literal('none') }).strict(),
  rawEvidenceRef: text,
  dataAsOf: instant,
  bars: z.array(barPointSchema.strict()).min(1).max(100_000),
  conversion: z.strictObject({
    kind: z.literal('multiplicative-price-factor'),
    adjustment: z.enum(['qfq', 'hfq']),
    evidenceRef: text,
    sourceRevision: text,
    basisRef: text,
    anchorFactor: positive,
    anchorAvailableAt: instant,
    volumeSemantics: z.literal('unadjusted'),
    amountSemantics: z.literal('unadjusted'),
    factors: z
      .array(z.strictObject({ timestamp: instant, value: positive, availableAt: instant }))
      .min(1)
      .max(100_000),
  }),
});

export type MarketDerivedSeriesInputV3 = z.infer<typeof marketDerivedSeriesInputV3Schema>;
export const MARKET_DERIVATION_ALGORITHM_V3 = 'raw-times-factor-over-fixed-anchor-binary64-v2';

/** 仅计算已核验的乘法关系；证据引用不替代 Reader 的真实准入核验。 */
export function deriveMarketSeriesV3(payload: MarketDerivedSeriesInputV3) {
  const input = marketDerivedSeriesInputV3Schema.parse(payload);
  const { conversion } = input;
  const algorithmRevision = MARKET_DERIVATION_ALGORITHM_V3;
  const anchorLate = compareDerivedInstantV3(conversion.anchorAvailableAt, input.dataAsOf) > 0;
  if (anchorLate || input.bars.length !== conversion.factors.length)
    throw new Error('派生序列缺少同截点的完整因子');
  let previous: string | null = null;
  const bars = input.bars.map((bar, index) => {
    const factor = conversion.factors[index]!;
    const outOfOrder = previous !== null && compareDerivedInstantV3(bar.timestamp, previous) <= 0;
    const factorMismatch = compareDerivedInstantV3(bar.timestamp, factor.timestamp) !== 0;
    if (outOfOrder || factorMismatch) throw new Error('派生因子必须与原始 Bar 严格递增且逐项对齐');
    previous = bar.timestamp;
    const afterCutoff =
      compareDerivedInstantV3(bar.timestamp, input.dataAsOf) > 0 ||
      compareDerivedInstantV3(bar.availableAt, input.dataAsOf) > 0 ||
      compareDerivedInstantV3(factor.availableAt, input.dataAsOf) > 0;
    if (afterCutoff || bar.completionStatus !== 'complete')
      throw new Error('派生序列输入不完整或晚于冻结截点');
    if (
      bar.low <= 0 ||
      bar.high < Math.max(bar.open, bar.close, bar.low) ||
      bar.low > Math.min(bar.open, bar.close, bar.high)
    )
      throw new Error('原始 Bar 价格关系无效');
    const multiplier = factor.value / conversion.anchorFactor;
    const price = (value: number) => {
      const result = value * multiplier;
      if (!Number.isFinite(result) || result <= 0) throw new Error('派生价格溢出或下溢');
      return result;
    };
    return {
      ...bar,
      open: price(bar.open),
      high: price(bar.high),
      low: price(bar.low),
      close: price(bar.close),
      availableAt: latestDerivedInstantV3([
        bar.availableAt,
        factor.availableAt,
        conversion.anchorAvailableAt,
      ]),
    };
  });
  const inputFingerprint = createHash('sha256')
    .update(JSON.stringify({ algorithmRevision, input }))
    .digest('hex');
  const factorOrEventFingerprint = createHash('sha256')
    .update(JSON.stringify(conversion))
    .digest('hex');
  return {
    kind: 'locally-derived' as const,
    identity: { ...input.identity, adjustment: conversion.adjustment },
    bars,
    derivation: {
      algorithmRevision,
      inputFingerprint,
      factorOrEventFingerprint,
      rawEvidenceRef: input.rawEvidenceRef,
      factorEvidenceRef: conversion.evidenceRef,
      factorSourceRevision: conversion.sourceRevision,
      basisRef: conversion.basisRef,
      anchorFactor: conversion.anchorFactor,
      volumeSemantics: conversion.volumeSemantics,
      amountSemantics: conversion.amountSemantics,
      dataAsOf: input.dataAsOf,
    },
  };
}
