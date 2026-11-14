import { DecimalValue } from './decimal.js';
import { isAvailableForDecisionAt } from './backtest-observation-clock.js';
import type { SizingInput, SizingResult } from './backtest-sizing.js';

/** Reference shares determine a budget; the normalized ledger still owns the resulting units. */
export function computePriceResearchSizing(
  input: SizingInput,
  normalizedSizing: (input: SizingInput) => SizingResult,
): SizingResult {
  if (input.accountingBasis !== 'normalized-series')
    return {
      status: 'rejected',
      reasonCode: 'UNSUPPORTED_UNIT',
      reason: '参考份数投入只用于价格研究的归一化记账',
      inputFacts: [],
    };
  if (input.rule.type !== 'fixedQuantity') return normalizedSizing(input);
  const reference = input.priceResearchReference?.actualPrice;
  if (!reference || reference.status === 'unavailable')
    return {
      status: 'unavailable',
      reasonCode: 'PRICE_UNAVAILABLE',
      reason: '操作时点缺少不复权参考价格，未执行参考份数投入',
      inputFacts: ['actualPrice=missing'],
    };
  if (!input.price || Date.parse(reference.occurredAt) !== Date.parse(input.price.occurredAt))
    return {
      status: 'unavailable',
      reasonCode: 'PRICE_UNAVAILABLE',
      reason: '不复权参考价与研究操作价的时点不一致',
      inputFacts: ['actualPrice=unaligned'],
    };
  if (!isAvailableForDecisionAt(reference, input.evaluationAt))
    return {
      status: 'unavailable',
      reasonCode: 'FUTURE_DATA',
      reason: '不复权参考价在研究操作时点不可见',
      inputFacts: ['actualPrice=not-visible'],
    };
  let notional: string;
  try {
    const quantity = DecimalValue.from(input.rule.quantity);
    const actualPrice = DecimalValue.from(reference.value);
    if (!quantity.isPositive() || !actualPrice.isPositive())
      throw new Error('non-positive reference');
    notional = quantity.times(actualPrice).toString();
  } catch {
    return {
      status: 'rejected',
      reasonCode: 'INVALID_DECIMAL',
      reason: '参考份数和不复权参考价必须是有效正十进制',
      inputFacts: [],
    };
  }
  const result = normalizedSizing({ ...input, rule: { type: 'fixedAmount', amount: notional } });
  if (result.status !== 'available') return result;
  return {
    ...result,
    inputFacts: [
      ...result.inputFacts,
      `research.referenceQuantity=${input.rule.quantity}`,
      `research.actualPrice=${reference.value}`,
      `research.requestedNotional=${notional}`,
    ],
  };
}
