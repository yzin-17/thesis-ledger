import { z } from 'zod';
import {
  deriveMarketSeriesV3,
  MARKET_DERIVATION_ALGORITHM_V3,
  marketDerivedSeriesInputV3Schema,
  type MarketDerivedSeriesInputV3,
} from './market-derived-series-v3.js';

const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
const snapshotSchema = z.strictObject({
  contractVersion: z.literal(3),
  kind: z.literal('locally-derived'),
  algorithmRevision: z.literal(MARKET_DERIVATION_ALGORITHM_V3),
  inputFingerprint: fingerprintSchema,
  input: marketDerivedSeriesInputV3Schema,
});

/** 冻结全部计算输入；存储位置和准入核验由调用方负责。 */
export function freezeMarketDerivedSeriesV3(payload: MarketDerivedSeriesInputV3) {
  const input = marketDerivedSeriesInputV3Schema.parse(payload);
  const result = deriveMarketSeriesV3(input);
  return snapshotSchema.parse({
    contractVersion: 3,
    kind: 'locally-derived',
    algorithmRevision: MARKET_DERIVATION_ALGORITHM_V3,
    inputFingerprint: result.derivation.inputFingerprint,
    input,
  });
}

/** 固定引用来自调用方冻结记录，不能从待读快照自身取值充当可信引用。 */
export function readMarketDerivedSeriesV3(
  payload: unknown,
  expectedFingerprint: string,
  limit?: number,
) {
  fingerprintSchema.parse(expectedFingerprint);
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0 || limit > 100_000))
    throw new Error('派生序列显示条数无效');
  const snapshot = snapshotSchema.parse(payload);
  if (snapshot.inputFingerprint !== expectedFingerprint) throw new Error('派生序列冻结引用不匹配');
  const result = deriveMarketSeriesV3(snapshot.input);
  if (result.derivation.inputFingerprint !== expectedFingerprint)
    throw new Error('派生序列冻结内容不匹配');
  return {
    ...result,
    fullBarCount: result.bars.length,
    bars: limit === undefined ? result.bars : result.bars.slice(-limit),
  };
}
