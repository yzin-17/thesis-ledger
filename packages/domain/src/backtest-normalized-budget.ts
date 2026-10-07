import { DecimalValue } from './decimal.js';

const normalizedQuantityScale = 40;
const normalizedQuantityScaleFactor = 10n ** BigInt(normalizedQuantityScale);

const floorNormalizedQuantityUnits = (value: string) => {
  const [integer, fraction = ''] = DecimalValue.from(value).toString().split('.');
  const fractionalDigits = fraction
    .slice(0, normalizedQuantityScale)
    .padEnd(normalizedQuantityScale, '0');
  return BigInt(integer!) * normalizedQuantityScaleFactor + BigInt(fractionalDigits || '0');
};

const normalizedQuantityFromUnits = (units: bigint) => {
  const digits = units.toString().padStart(normalizedQuantityScale + 1, '0');
  const integer = digits.slice(0, -normalizedQuantityScale);
  const fraction = digits.slice(-normalizedQuantityScale).replace(/0+$/, '');
  return DecimalValue.from(fraction ? `${integer}.${fraction}` : integer).toString();
};

export type NormalizedQuantityBudgetEvaluation<T> =
  | { status: 'affordable'; value: T }
  | { status: 'insufficient-cash' }
  | { status: 'unavailable'; reason: string };

export type NormalizedQuantityBudgetResult<T> =
  { status: 'available'; quantity: string; value: T } | { status: 'unavailable'; reason: string };

/**
 * Finds the largest affordable continuous normalized quantity using the same
 * 40-decimal search boundary as the exchange sizing adapter.
 */
export const fitNormalizedQuantityToAvailableCash = <T>(
  requestedQuantity: string,
  evaluate: (quantity: string) => NormalizedQuantityBudgetEvaluation<T>,
): NormalizedQuantityBudgetResult<T> => {
  const requested = DecimalValue.from(requestedQuantity);
  if (!requested.isPositive()) return { status: 'unavailable', reason: 'INVALID_QUANTITY' };

  const initial = evaluate(requestedQuantity);
  if (initial.status === 'affordable') {
    return { status: 'available', quantity: requestedQuantity, value: initial.value };
  }
  if (initial.status === 'unavailable') return initial;

  let low = 0n;
  let high = floorNormalizedQuantityUnits(requested.toString());
  let best: { quantity: string; value: T } | undefined;
  while (low < high) {
    const middle = low + (high - low + 1n) / 2n;
    const quantity = normalizedQuantityFromUnits(middle);
    const candidate = evaluate(quantity);
    if (candidate.status === 'affordable') {
      low = middle;
      best = { quantity, value: candidate.value };
    } else if (candidate.status === 'insufficient-cash') {
      high = middle - 1n;
    } else {
      return candidate;
    }
  }

  if (low === 0n || !best) {
    return { status: 'unavailable', reason: 'INSUFFICIENT_CASH' };
  }
  return { status: 'available', ...best };
};
