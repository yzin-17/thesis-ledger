import { DecimalValue } from './decimal.js';
import type {
  RulePriceCoordinateFacts,
  RuleScaleTransform,
} from './backtest-rule-compatibility.js';
type UnknownRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const asScaleTransform = (coordinate: RulePriceCoordinateFacts): RuleScaleTransform => {
  if (coordinate.scaleTransform) return coordinate.scaleTransform;
  if (coordinate.priceBasis.adjustment === 'none') return { kind: 'identity' };
  return { kind: 'unknown' };
};

export const isProvenUniformTransform = (coordinate: RulePriceCoordinateFacts) => {
  const transform = asScaleTransform(coordinate);
  if (transform.kind === 'identity') return true;
  if (transform.kind !== 'uniform-multiplicative' || !transform.evidenceRef.trim()) return false;
  try {
    return DecimalValue.from(transform.factor).isPositive();
  } catch {
    return false;
  }
};

export const transformsShareFactor = (
  left: RulePriceCoordinateFacts,
  right: RulePriceCoordinateFacts,
) => {
  const leftTransform = asScaleTransform(left);
  const rightTransform = asScaleTransform(right);
  if (leftTransform.kind === 'identity' && rightTransform.kind === 'identity') return true;
  if (
    leftTransform.kind !== 'uniform-multiplicative' ||
    rightTransform.kind !== 'uniform-multiplicative' ||
    !leftTransform.evidenceRef.trim() ||
    !rightTransform.evidenceRef.trim()
  ) {
    return false;
  }
  try {
    return (
      DecimalValue.from(leftTransform.factor).isPositive() &&
      DecimalValue.from(rightTransform.factor).isPositive() &&
      DecimalValue.from(leftTransform.factor).compareTo(rightTransform.factor) === 0
    );
  } catch {
    return false;
  }
};
