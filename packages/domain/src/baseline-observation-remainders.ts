import { DecimalValue } from './decimal.js';

type ObservationSource = {
  source: 'ENTRY_LEG' | 'BASELINE_COMPONENT';
  remainingQuantity: DecimalValue;
};

/** 收缩观察推算的余量；真实成交及其历史归因不由余额观察扣减。 */
export const baselineObservationReductions = (
  sources: readonly ObservationSource[],
  observedQuantity: DecimalValue,
) => {
  const reductions: Array<{ sourceIndex: number; remainingQuantity: DecimalValue }> = [];
  const currentQuantity = sources.reduce(
    (total, source) => total.plus(source.remainingQuantity),
    DecimalValue.from('0'),
  );
  let excess = currentQuantity.minus(observedQuantity);
  for (
    let sourceIndex = sources.length - 1;
    sourceIndex >= 0 && excess.isPositive();
    sourceIndex--
  ) {
    const source = sources[sourceIndex]!;
    if (source.source !== 'BASELINE_COMPONENT' || source.remainingQuantity.isZero()) continue;
    const reduction =
      excess.compareTo(source.remainingQuantity) < 0 ? excess : source.remainingQuantity;
    reductions.push({ sourceIndex, remainingQuantity: source.remainingQuantity.minus(reduction) });
    excess = excess.minus(reduction);
  }
  return reductions;
};
