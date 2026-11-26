import { DecimalValue } from './decimal.js';
import type { NumericExpression } from './backtest-strategy.js';
import type { NumericEvaluation } from './backtest-simulation.js';
import { mergeBacktestAvailability } from './backtest-observation-clock.js';

export const isScalarOperation = (
  node: NumericExpression,
): node is Extract<NumericExpression, { type: 'arithmetic' | 'absolute' }> =>
  node.type === 'arithmetic' || node.type === 'absolute';

export function evaluateScalarOperation(
  node: Extract<NumericExpression, { type: 'arithmetic' | 'absolute' }>,
  at: string,
  read: (input: NumericExpression) => NumericEvaluation,
): NumericEvaluation {
  const inputs =
    node.type === 'absolute' ? [read(node.input)] : [read(node.left), read(node.right)];
  const missing = inputs.find((value) => value.status !== 'available');
  if (missing) return missing;
  const values = inputs.map((input) =>
    DecimalValue.from(input.status === 'available' ? input.value : '0'),
  );
  const left = values[0]!;
  const right = values[1];
  let value: DecimalValue;
  if (node.type === 'absolute') value = left.isNegative() ? left.times('-1') : left;
  else {
    switch (node.operator) {
      case 'add':
        value = left.plus(right!);
        break;
      case 'subtract':
        value = left.minus(right!);
        break;
      case 'multiply':
        value = left.times(right!);
        break;
      case 'divide':
        if (right!.isZero()) return { status: 'unavailable', occurredAt: at, reason: '除数为零' };
        value = left.dividedBy(right!, 20);
        break;
      case 'min':
        value = left.compareTo(right!) <= 0 ? left : right!;
        break;
      case 'max':
        value = left.compareTo(right!) >= 0 ? left : right!;
        break;
    }
  }
  return {
    status: 'available',
    occurredAt: at,
    value: value.toString(),
    ...mergeBacktestAvailability(inputs.filter((input) => input.status === 'available')),
  };
}
