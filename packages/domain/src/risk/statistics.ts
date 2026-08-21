export const currentDrawdown = (values: readonly number[]) => {
  if (values.length === 0) return null;
  const peak = Math.max(...values);
  const current = values.at(-1)!;
  return peak <= 0 ? null : current / peak - 1;
};

export const trailingStopTriggered = (price: number, holdingPeak: number, threshold: number) => {
  if (holdingPeak <= 0 || threshold < 0) return null;
  return { drawdown: price / holdingPeak - 1, triggered: price / holdingPeak - 1 < -threshold };
};

export const crossed = (
  previousLeft: number,
  previousRight: number,
  currentLeft: number,
  currentRight: number,
  direction: 'above' | 'below',
) =>
  direction === 'above'
    ? previousLeft <= previousRight && currentLeft > currentRight
    : previousLeft >= previousRight && currentLeft < currentRight;

export const ratioThreshold = (
  numerator: number | undefined,
  denominator: number | undefined,
  threshold: number,
) => {
  if (numerator === undefined || denominator === undefined || denominator <= 0) return null;
  const ratio = numerator / denominator;
  return { ratio, triggered: ratio > threshold };
};

export const concentratedExposure = (
  positions: readonly { symbol?: string; key?: string; weight: number }[],
  threshold: number,
) => {
  const known = positions.filter((position) => position.key);
  const coverage = positions.reduce(
    (sum, position) => sum + (position.key ? position.weight : 0),
    0,
  );
  const grouped = known.reduce<Record<string, number>>((result, position) => {
    result[position.key!] = (result[position.key!] ?? 0) + position.weight;
    return result;
  }, {});
  const exposures = Object.entries(grouped)
    .map(([key, weight]) => ({ key, weight, triggered: weight > threshold }))
    .sort((left, right) => right.weight - left.weight);
  return {
    coverage,
    missingCount: positions.length - known.length,
    missingSymbols: positions
      .filter((position) => !position.key)
      .map((position) => position.symbol ?? 'unknown'),
    exposures,
  };
};

export const pearsonCorrelation = (left: readonly number[], right: readonly number[]) => {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index]! - leftMean;
    const rightDelta = right[index]! - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }
  if (leftVariance === 0 || rightVariance === 0) return null;
  return covariance / Math.sqrt(leftVariance * rightVariance);
};
